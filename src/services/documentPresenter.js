/**
 * Conversión de registros internos a la forma pública que ven los clientes
 * y búsqueda de documentos "activos" (existentes y no caducados).
 */
import { getCategory, getFormat } from '../constants/officeFormats.js';
import { HttpError } from '../utils/httpError.js';

/** URL de la página de descarga a la que apunta el QR. */
export function buildShareUrl(baseUrl, id) {
  return `${baseUrl}/d/${id}`;
}

/**
 * Devuelve los datos públicos de un documento. Nunca incluye el hash del
 * token de eliminación ni rutas del servidor.
 */
export function toPublicDocument(record, baseUrl) {
  const category = getCategory(record.category);
  const format = getFormat(record.extension);
  const shareUrl = buildShareUrl(baseUrl, record.id);
  return {
    id: record.id,
    originalName: record.originalName,
    extension: record.extension,
    formatName: format?.name ?? record.extension.toUpperCase(),
    category: record.category,
    categoryLabel: category?.label ?? record.category,
    mimeType: record.mimeType,
    size: record.size,
    sha256: record.sha256,
    macros: Boolean(format?.macros),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    downloads: record.downloads ?? 0,
    shareUrl,
    downloadUrl: `${shareUrl}/download`,
    qrUrl: `/api/documents/${record.id}/qr`,
  };
}

/**
 * Obtiene un documento disponible o lanza el error HTTP adecuado.
 * @throws {HttpError} 404 si no existe, 410 si ha caducado.
 */
export function getActiveDocument(store, id) {
  const record = store.get(id);
  if (!record) {
    throw new HttpError(404, 'No existe ningún documento con ese enlace. Es posible que se haya eliminado.', 'DOCUMENT_NOT_FOUND');
  }
  if (store.isExpired(record)) {
    throw new HttpError(410, 'Este enlace ha caducado y el documento ya no está disponible.', 'DOCUMENT_EXPIRED');
  }
  return record;
}
