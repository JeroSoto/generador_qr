/**
 * Validación de los archivos subidos.
 *
 * Se comprueban dos cosas:
 *  1. Que la extensión esté en el catálogo de formatos admitidos.
 *  2. Que los primeros bytes del archivo ("firma" o magic number)
 *     correspondan a esa extensión. Así se evita, por ejemplo, que un
 *     ejecutable renombrado a .docx se publique como documento de Word.
 *
 * La comprobación es deliberadamente ligera: no abre el ZIP ni el
 * contenedor OLE2, por lo que no distingue un .docx de un .xlsx (ambos
 * son ZIP). Es suficiente para filtrar archivos ajenos a la ofimática.
 */
import fs from 'node:fs/promises';
import { SIGNATURES, getFormat } from '../constants/officeFormats.js';
import { HttpError } from '../utils/httpError.js';

/** Bytes que se leen del inicio del archivo para analizarlo. */
export const HEADER_LENGTH = 8192;

const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ONENOTE_HEADER = Buffer.from([0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d, 0xae, 0xb1, 0x53, 0x78, 0xd0, 0x29, 0x96, 0xd3]);
const JET_HEADER = Buffer.from([0x00, 0x01, 0x00, 0x00]);
const PDF_MARKER = Buffer.from('%PDF-', 'latin1');
const RTF_MARKER = Buffer.from('{\\rtf', 'latin1');
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** Extensión en minúsculas y sin punto ("Informe.DOCX" → "docx"). */
export function getExtension(filename) {
  const name = String(filename ?? '');
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
}

/** Heurística de texto plano: sin bytes nulos (o UTF-16 con BOM, como exporta Excel). */
function looksLikeText(header) {
  if (header.length >= 2 && ((header[0] === 0xff && header[1] === 0xfe) || (header[0] === 0xfe && header[1] === 0xff))) {
    return true;
  }
  return !header.includes(0x00);
}

/**
 * Indica si la cabecera binaria coincide con la firma esperada.
 * @param {string} signature Una de las claves de SIGNATURES.
 * @param {Buffer} header    Primeros bytes del archivo.
 */
export function matchesSignature(signature, header) {
  switch (signature) {
    case SIGNATURES.ZIP:
      return header.subarray(0, 4).equals(ZIP_LOCAL_HEADER);
    case SIGNATURES.OLE2:
      return header.subarray(0, 8).equals(OLE2_HEADER);
    case SIGNATURES.ONENOTE:
      return header.subarray(0, 16).equals(ONENOTE_HEADER);
    case SIGNATURES.JET: {
      const engine = header.subarray(4, 19).toString('latin1');
      return header.subarray(0, 4).equals(JET_HEADER) && (engine === 'Standard Jet DB' || engine === 'Standard ACE DB');
    }
    case SIGNATURES.PDF:
      // La especificación permite basura antes de "%PDF-" en el primer KB.
      return header.subarray(0, 1024).includes(PDF_MARKER);
    case SIGNATURES.RTF: {
      const start = header.subarray(0, 3).equals(UTF8_BOM) ? 3 : 0;
      return header.subarray(start, start + 5).equals(RTF_MARKER);
    }
    case SIGNATURES.TEXT:
      return looksLikeText(header);
    default:
      return false;
  }
}

/** Lee los primeros `length` bytes de un archivo. */
export async function readHeader(filePath, length = HEADER_LENGTH) {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Valida un archivo ya guardado en disco.
 *
 * @param {string} filePath     Ruta del archivo temporal.
 * @param {string} originalName Nombre original (para obtener la extensión).
 * @returns {Promise<{extension: string, format: object}>}
 * @throws {HttpError} 415 si el formato no está admitido o no coincide.
 */
export async function validateOfficeFile(filePath, originalName) {
  const extension = getExtension(originalName);
  const format = getFormat(extension);
  if (!format) {
    const shown = extension ? `.${extension}` : 'sin extensión';
    throw new HttpError(415, `El formato ${shown} no está admitido. Sube un documento de Office, PDF, CSV o TXT.`, 'UNSUPPORTED_FORMAT');
  }

  const header = await readHeader(filePath);
  if (!matchesSignature(format.signature, header)) {
    throw new HttpError(
      415,
      `El contenido del archivo no corresponde a un ${format.name} (.${extension}). Puede estar dañado o tener la extensión cambiada.`,
      'SIGNATURE_MISMATCH',
    );
  }
  return { extension, format };
}
