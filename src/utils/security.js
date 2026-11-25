/**
 * Generación de identificadores y tokens, y comparación segura.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

/** Formato de los identificadores públicos de documento (12 caracteres base64url). */
export const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{12}$/;

/** Identificador público, corto y no adivinable (72 bits de entropía). */
export function generateId() {
  return crypto.randomBytes(9).toString('base64url');
}

/** Token secreto para eliminar un documento (192 bits de entropía). */
export function generateToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/** Hash SHA-256 en hexadecimal de un texto (se guarda el hash, nunca el token). */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Compara dos cadenas hexadecimales en tiempo constante. */
export function safeEqualHex(a, b) {
  const bufferA = Buffer.from(String(a), 'hex');
  const bufferB = Buffer.from(String(b), 'hex');
  return bufferA.length === bufferB.length && bufferA.length > 0 && crypto.timingSafeEqual(bufferA, bufferB);
}

/** Calcula el SHA-256 de un archivo leyéndolo por streaming. */
export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}
