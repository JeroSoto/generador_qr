/**
 * Almacén de documentos.
 *
 * - Los archivos se guardan en `uploadsDir`, con el id como nombre y SIN
 *   extensión, de modo que nunca se ejecuten ni se sirvan por accidente
 *   como contenido estático.
 * - Los metadatos se mantienen en memoria (Map) y se persisten en un único
 *   JSON (`dataDir/documents.json`). La escritura es atómica (archivo
 *   temporal + rename) y está serializada en una cola para que dos
 *   peticiones simultáneas no se pisen.
 *
 * Es suficiente para un uso personal o de equipo pequeño. Para muchos
 * usuarios concurrentes conviene sustituirlo por una base de datos y un
 * almacenamiento de objetos (ver docs/DOCUMENTACION-TECNICA.md).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DOCUMENT_ID_PATTERN } from '../utils/security.js';

const INDEX_FILENAME = 'documents.json';
const INDEX_VERSION = 1;
/** Antigüedad a partir de la cual un archivo temporal se considera abandonado. */
const STALE_TMP_MS = 60 * 60 * 1000;

/**
 * rename() con reintentos: en Windows el antivirus o el indexador pueden
 * bloquear el archivo unos milisegundos (EPERM/EBUSY).
 */
async function renameWithRetry(from, to, attempts = 5) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      if (attempt >= attempts || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      await delay(40 * attempt);
    }
  }
}

export class DocumentStore {
  /** @type {Map<string, object>} */
  #records = new Map();
  #indexPath;
  #uploadsDir;
  #tmpDir;
  #now;
  #writeQueue = Promise.resolve();

  /**
   * @param {object} options
   * @param {string} options.dataDir    Carpeta del índice JSON.
   * @param {string} options.uploadsDir Carpeta de los archivos.
   * @param {() => number} [options.now] Reloj inyectable (pruebas de caducidad).
   */
  constructor({ dataDir, uploadsDir, now = () => Date.now() }) {
    this.#indexPath = path.join(dataDir, INDEX_FILENAME);
    this.#uploadsDir = uploadsDir;
    this.#tmpDir = path.join(uploadsDir, 'tmp');
    this.#now = now;
  }

  /** Carpeta donde Multer deja los archivos mientras se validan. */
  get tmpDir() {
    return this.#tmpDir;
  }

  /** Número de documentos registrados. */
  get size() {
    return this.#records.size;
  }

  /** Crea las carpetas, carga el índice y limpia restos de ejecuciones anteriores. */
  async init() {
    await fs.mkdir(path.dirname(this.#indexPath), { recursive: true });
    await fs.mkdir(this.#tmpDir, { recursive: true });
    await this.#loadIndex();
    await this.#dropRecordsWithoutFile();
    await this.cleanTmp(0);
  }

  async #loadIndex() {
    let raw;
    try {
      raw = await fs.readFile(this.#indexPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    try {
      const parsed = JSON.parse(raw);
      const documents = Array.isArray(parsed?.documents) ? parsed.documents : [];
      for (const record of documents) {
        if (DOCUMENT_ID_PATTERN.test(record?.id)) this.#records.set(record.id, record);
      }
    } catch {
      // Un índice dañado no debe impedir arrancar: se aparta y se empieza de cero.
      const backupPath = `${this.#indexPath}.danado-${Date.now()}`;
      await fs.rename(this.#indexPath, backupPath);
      console.warn(`[almacen] El índice estaba dañado. Copia guardada en ${backupPath}; se inicia vacío.`);
    }
  }

  /** Elimina del índice los documentos cuyo archivo ya no existe en disco. */
  async #dropRecordsWithoutFile() {
    let changed = false;
    for (const id of [...this.#records.keys()]) {
      try {
        await fs.access(this.filePath(id));
      } catch {
        this.#records.delete(id);
        changed = true;
      }
    }
    if (changed) await this.#persist();
  }

  /** Ruta absoluta del archivo de un documento. Valida el id para evitar path traversal. */
  filePath(id) {
    if (!DOCUMENT_ID_PATTERN.test(id)) throw new Error(`Identificador de documento inválido: ${id}`);
    return path.join(this.#uploadsDir, id);
  }

  has(id) {
    return this.#records.has(id);
  }

  /** Devuelve el registro (aunque esté caducado) o `null`. */
  get(id) {
    if (!DOCUMENT_ID_PATTERN.test(String(id))) return null;
    return this.#records.get(id) ?? null;
  }

  /** Indica si un registro ha superado su fecha de caducidad. */
  isExpired(record) {
    return Boolean(record.expiresAt) && Date.parse(record.expiresAt) <= this.#now();
  }

  /**
   * Registra un documento nuevo moviendo el archivo temporal a su ubicación final.
   * @param {object} record       Metadatos completos (incluye `id`).
   * @param {string} tempFilePath Archivo ya validado en la carpeta temporal.
   */
  async create(record, tempFilePath) {
    await renameWithRetry(tempFilePath, this.filePath(record.id));
    this.#records.set(record.id, { ...record });
    await this.#persist();
    return this.#records.get(record.id);
  }

  /** Elimina un documento y su archivo. Devuelve `false` si no existía. */
  async remove(id) {
    if (!this.#records.has(id)) return false;
    this.#records.delete(id);
    await fs.rm(this.filePath(id), { force: true });
    await this.#persist();
    return true;
  }

  /** Incrementa el contador de descargas de un documento. */
  async registerDownload(id) {
    const record = this.#records.get(id);
    if (!record) return;
    record.downloads = (record.downloads ?? 0) + 1;
    record.lastDownloadAt = new Date(this.#now()).toISOString();
    await this.#persist();
  }

  /**
   * Borra los documentos caducados y los temporales abandonados.
   * @returns {Promise<number>} Número de documentos eliminados.
   */
  async purgeExpired() {
    const expired = [...this.#records.values()].filter((record) => this.isExpired(record));
    for (const record of expired) {
      this.#records.delete(record.id);
      await fs.rm(this.filePath(record.id), { force: true });
    }
    if (expired.length > 0) await this.#persist();
    await this.cleanTmp(STALE_TMP_MS);
    return expired.length;
  }

  /** Elimina de la carpeta temporal los archivos más antiguos que `maxAgeMs`. */
  async cleanTmp(maxAgeMs) {
    const entries = await fs.readdir(this.#tmpDir).catch(() => []);
    await Promise.all(
      entries.map(async (name) => {
        const entryPath = path.join(this.#tmpDir, name);
        const stats = await fs.stat(entryPath).catch(() => null);
        if (stats && Date.now() - stats.mtimeMs >= maxAgeMs) {
          await fs.rm(entryPath, { force: true, recursive: true });
        }
      }),
    );
  }

  /**
   * Guarda el índice en disco. Toma una instantánea en el momento de la
   * llamada y encadena la escritura detrás de las anteriores.
   */
  #persist() {
    const snapshot = JSON.stringify({ version: INDEX_VERSION, documents: [...this.#records.values()] }, null, 2);
    const write = async () => {
      const tempPath = `${this.#indexPath}.tmp`;
      await fs.writeFile(tempPath, snapshot, 'utf8');
      await renameWithRetry(tempPath, this.#indexPath);
    };
    // Se ejecuta aunque la escritura anterior haya fallado.
    this.#writeQueue = this.#writeQueue.then(write, write);
    return this.#writeQueue;
  }
}
