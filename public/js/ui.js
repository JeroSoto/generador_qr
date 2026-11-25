/**
 * Utilidades de interfaz: notificaciones, formato, iconos y portapapeles.
 */

/** Atajo para document.getElementById. */
export const byId = (id) => document.getElementById(id);

/** Crea un elemento con clases, atributos y texto en una sola llamada. */
export function el(tag, { className, text, attrs } = {}, children = []) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  for (const [name, value] of Object.entries(attrs ?? {})) element.setAttribute(name, value);
  for (const child of children) element.append(child);
  return element;
}

/** Icono del sprite SVG definido en index.html. */
export function icon(name) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svgNs, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/** Pinta el icono de una familia de documentos (cuadrado de color con siglas). */
export function paintTile(tile, category) {
  tile.classList.remove('tile--link');
  tile.textContent = category?.badge ?? 'DOC';
  tile.style.setProperty('--tile-color', category?.color ?? '#475569');
}

/** Bytes legibles en español ("1,5 MB"). */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${new Intl.NumberFormat('es', { maximumFractionDigits: exponent === 0 ? 0 : 1 }).format(value)} ${units[exponent]}`;
}

/** Fecha ISO en formato corto ("25 nov 2026, 14:10"). */
export function formatDate(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoString));
}

/** Ejecuta `fn` sólo cuando dejan de llegar llamadas durante `ms` milisegundos. */
export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const TOAST_ICONS = { success: 'check', error: 'alert', info: 'info' };

/** Muestra una notificación temporal en la esquina inferior. */
export function toast(message, type = 'info') {
  const container = byId('toasts');
  const item = el('div', { className: `toast toast--${type}`, attrs: { role: type === 'error' ? 'alert' : 'status' } }, [
    icon(TOAST_ICONS[type] ?? 'info'),
    el('span', { text: message }),
  ]);
  container.append(item);
  setTimeout(() => {
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), 220);
  }, type === 'error' ? 5200 : 3200);
}

/**
 * Copia texto al portapapeles. La API moderna sólo existe en contextos
 * seguros (https o localhost); en la red local por http se usa el método
 * clásico con un <textarea> temporal.
 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Se intenta el método clásico.
    }
  }
  const textarea = el('textarea', { attrs: { readonly: '', 'aria-hidden': 'true' } });
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

/** Indica si el navegador permite copiar imágenes al portapapeles. */
export function canCopyImages() {
  return Boolean(window.isSecureContext && navigator.clipboard?.write && window.ClipboardItem);
}

/** Descarga un Blob con el nombre indicado. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { attrs: { href: url, download: filename } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convierte un texto en un nombre de archivo seguro ("Mi informe.docx" → "Mi-informe"). */
export function toFileSlug(text, fallback = 'codigo-qr') {
  const slug = String(text ?? '')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}
