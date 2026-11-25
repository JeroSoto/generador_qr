/**
 * Historial de QR generados, guardado en el localStorage de este navegador.
 *
 * Cada entrada de tipo "document" conserva el token de eliminación que
 * devolvió el servidor: es lo que permite borrar el documento más tarde.
 * Si se vacía el almacenamiento del navegador se pierde ese token (el
 * documento seguirá caducando de forma automática).
 */

const STORAGE_KEY = 'qr-office:historial:v1';
const MAX_ENTRIES = 30;

/**
 * @typedef {object} HistoryEntry
 * @property {'document'|'url'} kind
 * @property {string} id
 * @property {string} name         Nombre del documento o del servicio.
 * @property {string} createdAt    Fecha ISO.
 * @property {string} [category]   Familia (sólo documentos).
 * @property {number} [size]       Bytes (sólo documentos).
 * @property {string|null} [expiresAt]
 * @property {string} [deleteToken]
 * @property {string} [text]       Enlace codificado (sólo enlaces).
 * @property {boolean} [unavailable] Marcado al detectar que ya no existe.
 */

/** @returns {HistoryEntry[]} */
export function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.id === 'string') : [];
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Almacenamiento lleno o bloqueado: el historial es una comodidad.
  }
}

/** Añade (o sube al principio) una entrada. Devuelve el historial actualizado. */
export function addEntry(entry) {
  const entries = loadHistory().filter((existing) => existing.id !== entry.id);
  entries.unshift(entry);
  saveHistory(entries);
  return entries.slice(0, MAX_ENTRIES);
}

/** Modifica campos de una entrada existente. */
export function updateEntry(id, changes) {
  const entries = loadHistory().map((entry) => (entry.id === id ? { ...entry, ...changes } : entry));
  saveHistory(entries);
  return entries;
}

/** Elimina una entrada. */
export function removeEntry(id) {
  const entries = loadHistory().filter((entry) => entry.id !== id);
  saveHistory(entries);
  return entries;
}

/** Vacía el historial. */
export function clearHistory() {
  saveHistory([]);
  return [];
}

/** Identificador aleatorio para entradas de enlace (funciona también sin https). */
export function randomId(prefix = 'url') {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
