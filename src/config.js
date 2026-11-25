/**
 * Configuración de la aplicación a partir de variables de entorno.
 *
 * Las variables se leen de `process.env`; los scripts de npm cargan además
 * el archivo `.env` si existe (opción --env-file-if-exists de Node.js).
 * Consulta `.env.example` para ver todas las opciones disponibles.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBaseUrl } from './utils/network.js';

/** Carpeta raíz del proyecto (la que contiene package.json). */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Lee un entero de una variable de entorno validando su rango. */
function readInt(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`La variable ${name} debe ser un entero entre ${min} y ${max} (valor recibido: "${raw}")`);
  }
  return value;
}

/** Lee un booleano ("true"/"false", "1"/"0") de una variable de entorno. */
function readBool(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'si', 'sí'].includes(raw.trim().toLowerCase());
}

/**
 * Construye el objeto de configuración.
 *
 * @param {object} [overrides] Valores que tienen prioridad sobre el entorno
 *   (lo usan las pruebas para aislar el almacenamiento, por ejemplo).
 * @param {NodeJS.ProcessEnv} [env] Variables de entorno.
 */
export function loadConfig(overrides = {}, env = process.env) {
  const storageDir = path.resolve(ROOT_DIR, overrides.storageDir ?? env.STORAGE_DIR ?? 'storage');

  const config = {
    port: readInt(env, 'PORT', 3000, 0, 65535),
    host: env.HOST?.trim() || '0.0.0.0',
    /** URL a la que apuntarán los QR. `null` = detectar la IP de la red local. */
    publicBaseUrl: normalizeBaseUrl(env.PUBLIC_BASE_URL),
    maxFileSizeBytes: readInt(env, 'MAX_FILE_SIZE_MB', 25, 1, 1024) * 1024 * 1024,
    /** Horas que se conserva cada documento. 0 = sin caducidad. */
    fileTtlHours: readInt(env, 'FILE_TTL_HOURS', 168, 0, 87600),
    /** Valor para `app.set('trust proxy')`: número de proxies delante del servidor. */
    trustProxy: readInt(env, 'TRUST_PROXY', 0, 0, 10),
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      uploads: readInt(env, 'RATE_LIMIT_UPLOADS', 30, 1, 100000),
      qr: readInt(env, 'RATE_LIMIT_QR', 600, 1, 100000),
    },
    logRequests: readBool(env, 'LOG_REQUESTS', env.NODE_ENV !== 'test'),
    publicDir: path.join(ROOT_DIR, 'public'),
    storageDir,
    uploadsDir: path.join(storageDir, 'uploads'),
    dataDir: path.join(storageDir, 'data'),
  };

  const merged = { ...config, ...overrides };
  // Si las pruebas cambian storageDir, las subcarpetas se recalculan.
  if (overrides.storageDir) {
    merged.uploadsDir = overrides.uploadsDir ?? path.join(storageDir, 'uploads');
    merged.dataDir = overrides.dataDir ?? path.join(storageDir, 'data');
  }
  return merged;
}
