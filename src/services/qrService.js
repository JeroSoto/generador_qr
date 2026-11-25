/**
 * Generación de códigos QR (PNG y SVG) con la librería `qrcode`.
 *
 * Todas las opciones llegan del cliente, así que se validan aquí antes de
 * llamar a la librería: el resto del servidor sólo trabaja con opciones
 * ya normalizadas.
 */
import QRCode from 'qrcode';
import { HttpError } from '../utils/httpError.js';

/** Valores por defecto (margen 4 = "zona silenciosa" que exige ISO/IEC 18004). */
export const QR_DEFAULTS = Object.freeze({
  format: 'png',
  size: 512,
  margin: 4,
  ecc: 'M',
  fg: '#0F172A',
  bg: '#FFFFFF',
});

export const QR_LIMITS = Object.freeze({
  minSize: 128,
  maxSize: 2048,
  minMargin: 0,
  maxMargin: 10,
  /** Capacidad máxima de un QR versión 40 en modo byte con corrección L. */
  maxTextBytes: 2953,
  eccLevels: ['L', 'M', 'Q', 'H'],
  formats: ['png', 'svg'],
});

const HEX_COLOR = /^#?([0-9a-f]{6})$/i;

/** Convierte un valor a entero dentro de un rango o lanza HttpError 400. */
function toIntInRange(value, fallback, min, max, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new HttpError(400, `${label} debe ser un número entero entre ${min} y ${max}.`, 'INVALID_QR_OPTION');
  }
  return number;
}

/** Normaliza un color "#RRGGBB" (acepta también "RRGGBB" en la query). */
function toHexColor(value, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const match = String(value).trim().match(HEX_COLOR);
  if (!match) {
    throw new HttpError(400, `${label} debe ser un color hexadecimal con el formato #RRGGBB.`, 'INVALID_QR_OPTION');
  }
  return `#${match[1].toUpperCase()}`;
}

/**
 * Valida y completa las opciones de renderizado.
 * @param {object} input Opciones tal cual llegan del cliente (query o JSON).
 * @returns {{format: string, size: number, margin: number, ecc: string, fg: string, bg: string}}
 */
export function normalizeQrOptions(input = {}) {
  const format = String(input.format ?? QR_DEFAULTS.format).toLowerCase();
  if (!QR_LIMITS.formats.includes(format)) {
    throw new HttpError(400, 'El formato del QR debe ser "png" o "svg".', 'INVALID_QR_OPTION');
  }

  const ecc = String(input.ecc ?? QR_DEFAULTS.ecc).toUpperCase();
  if (!QR_LIMITS.eccLevels.includes(ecc)) {
    throw new HttpError(400, 'El nivel de corrección debe ser L, M, Q o H.', 'INVALID_QR_OPTION');
  }

  const fg = toHexColor(input.fg, QR_DEFAULTS.fg, 'El color del código');
  const bg = toHexColor(input.bg, QR_DEFAULTS.bg, 'El color de fondo');
  if (fg === bg) {
    throw new HttpError(400, 'El color del código y el de fondo no pueden ser iguales: el QR sería ilegible.', 'INVALID_QR_OPTION');
  }

  return {
    format,
    ecc,
    fg,
    bg,
    size: toIntInRange(input.size, QR_DEFAULTS.size, QR_LIMITS.minSize, QR_LIMITS.maxSize, 'El tamaño'),
    margin: toIntInRange(input.margin, QR_DEFAULTS.margin, QR_LIMITS.minMargin, QR_LIMITS.maxMargin, 'El margen'),
  };
}

/** Comprueba que el texto a codificar sea válido y quepa en un QR. */
export function assertEncodableText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new HttpError(400, 'Falta el contenido que se codificará en el QR.', 'EMPTY_QR_TEXT');
  }
  if (Buffer.byteLength(text, 'utf8') > QR_LIMITS.maxTextBytes) {
    throw new HttpError(422, `El contenido supera los ${QR_LIMITS.maxTextBytes} bytes que admite un código QR.`, 'QR_TEXT_TOO_LONG');
  }
}

/**
 * Genera la imagen del QR.
 * @param {string} text    Contenido a codificar (normalmente una URL).
 * @param {object} options Opciones ya normalizadas con normalizeQrOptions().
 * @returns {Promise<{body: Buffer|string, contentType: string, extension: string}>}
 */
export async function renderQr(text, options) {
  assertEncodableText(text);
  const qrOptions = {
    errorCorrectionLevel: options.ecc,
    margin: options.margin,
    width: options.size,
    color: { dark: options.fg, light: options.bg },
  };

  try {
    if (options.format === 'svg') {
      const svg = await QRCode.toString(text, { ...qrOptions, type: 'svg' });
      return { body: svg, contentType: 'image/svg+xml; charset=utf-8', extension: 'svg' };
    }
    const png = await QRCode.toBuffer(text, { ...qrOptions, type: 'png' });
    return { body: png, contentType: 'image/png', extension: 'png' };
  } catch (error) {
    // La librería avisa cuando los datos no caben con el nivel elegido.
    if (/too big|amount of data/i.test(error.message)) {
      throw new HttpError(422, `El contenido es demasiado largo para el nivel de corrección ${options.ecc}. Prueba con un nivel más bajo.`, 'QR_TEXT_TOO_LONG');
    }
    throw error;
  }
}
