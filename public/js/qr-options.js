/**
 * Opciones visuales del QR: lectura/escritura del formulario, persistencia
 * local y comprobaciones de legibilidad (contraste, colores invertidos,
 * margen).
 */

const STORAGE_KEY = 'qr-office:opciones:v1';

/** Valores por defecto (deben coincidir con QR_DEFAULTS del servidor). */
export const DEFAULT_OPTIONS = Object.freeze({ size: 512, margin: 4, ecc: 'M', fg: '#0F172A', bg: '#FFFFFF' });

/** Lee las opciones actuales del formulario. */
export function readOptions(form) {
  const data = new FormData(form);
  return {
    size: Number(data.get('size')),
    margin: Number(data.get('margin')),
    ecc: String(data.get('ecc')),
    fg: String(data.get('fg')).toUpperCase(),
    bg: String(data.get('bg')).toUpperCase(),
  };
}

/** Vuelca unas opciones en el formulario. */
export function writeOptions(form, options) {
  form.elements.size.value = String(options.size);
  form.elements.margin.value = String(options.margin);
  form.elements.ecc.value = options.ecc;
  form.elements.fg.value = options.fg.toLowerCase();
  form.elements.bg.value = options.bg.toLowerCase();
}

/** Recupera las opciones guardadas en este navegador (o las de por defecto). */
export function loadSavedOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_OPTIONS };
    const merged = { ...DEFAULT_OPTIONS, ...saved };
    const validColor = (value) => /^#[0-9A-F]{6}$/i.test(value);
    return {
      size: [256, 512, 1024, 2048].includes(Number(merged.size)) ? Number(merged.size) : DEFAULT_OPTIONS.size,
      margin: Number.isInteger(merged.margin) && merged.margin >= 0 && merged.margin <= 10 ? merged.margin : DEFAULT_OPTIONS.margin,
      ecc: ['L', 'M', 'Q', 'H'].includes(merged.ecc) ? merged.ecc : DEFAULT_OPTIONS.ecc,
      fg: validColor(merged.fg) ? merged.fg.toUpperCase() : DEFAULT_OPTIONS.fg,
      bg: validColor(merged.bg) ? merged.bg.toUpperCase() : DEFAULT_OPTIONS.bg,
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

/** Guarda las opciones en este navegador (si el almacenamiento está disponible). */
export function saveOptions(options) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // Navegación privada o almacenamiento bloqueado: no es imprescindible.
  }
}

/** Luminancia relativa de un color "#RRGGBB" según WCAG 2.x. */
export function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste entre dos colores (de 1 a 21). */
export function contrastRatio(hexA, hexB) {
  const [light, dark] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Devuelve avisos de legibilidad para unas opciones. Una lista vacía
 * significa que el QR debería leerse sin problemas.
 */
export function getReadabilityWarnings({ fg, bg, margin }) {
  const warnings = [];
  if (fg.toUpperCase() === bg.toUpperCase()) {
    warnings.push('El color del código y el del fondo son iguales: el QR no se podrá leer.');
    return warnings;
  }
  const ratio = contrastRatio(fg, bg);
  if (ratio < 4) {
    warnings.push(`El contraste es bajo (${ratio.toFixed(1)}:1). Muchos lectores necesitan al menos 4:1.`);
  }
  if (relativeLuminance(fg) > relativeLuminance(bg)) {
    warnings.push('El código es más claro que el fondo (colores invertidos). Algunas cámaras no reconocen QR invertidos.');
  }
  if (margin < 2) {
    warnings.push('Un margen menor de 2 módulos puede impedir la lectura si el QR se coloca junto a otros elementos.');
  }
  return warnings;
}
