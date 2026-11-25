/**
 * Utilidades de formato y saneamiento de texto usadas por el servidor.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa un valor para insertarlo de forma segura en HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Convierte bytes a una cadena legible en español ("1,5 MB"). */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const formatted = new Intl.NumberFormat('es', { maximumFractionDigits: exponent === 0 ? 0 : 1 }).format(value);
  return `${formatted} ${units[exponent]}`;
}

/** Formatea una fecha ISO como "25 nov 2026, 14:10". */
export function formatDate(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoString));
}

/**
 * Corrige el nombre de archivo que entrega Multer.
 *
 * El navegador envía el nombre en UTF-8, pero busboy (usado por Multer) lo
 * interpreta como latin1, de modo que "año.docx" llega como "aÃ±o.docx".
 * Se reinterpreta en UTF-8 y, si el resultado no es válido (contiene el
 * carácter de reemplazo), se conserva el original.
 */
export function decodeMulterFilename(name) {
  const decoded = Buffer.from(String(name ?? ''), 'latin1').toString('utf8');
  return decoded.includes('�') ? String(name ?? '') : decoded;
}

/**
 * Limpia un nombre de archivo para mostrarlo y usarlo en Content-Disposition:
 * quita rutas, caracteres de control y caracteres reservados de Windows, y
 * limita la longitud conservando la extensión.
 */
export function sanitizeFilename(name, maxLength = 150) {
  const base = String(name ?? '')
    .split(/[\\/]/)
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  if (!base) return 'documento';
  if (base.length <= maxLength) return base;

  const dotIndex = base.lastIndexOf('.');
  const extension = dotIndex > 0 ? base.slice(dotIndex) : '';
  return base.slice(0, maxLength - extension.length).trimEnd() + extension;
}

/** Devuelve el nombre sin la extensión ("informe.docx" → "informe"). */
export function stripExtension(name) {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
}
