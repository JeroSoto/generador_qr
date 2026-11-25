/**
 * Manejo centralizado de errores.
 *
 * Convierte cualquier error (HttpError propio, errores de Multer, errores
 * del parser JSON, etc.) en una respuesta coherente:
 *   - Rutas /api/* → JSON  { error: { code, message } }
 *   - Resto        → página HTML de error
 */
import multer from 'multer';
import { HttpError } from '../utils/httpError.js';
import { formatBytes } from '../utils/format.js';
import { renderErrorPage } from '../views/pages.js';

/** Traduce un error cualquiera a HttpError con mensaje en español. */
function toHttpError(error, config) {
  if (error instanceof HttpError) return error;

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return new HttpError(413, `El archivo supera el tamaño máximo permitido (${formatBytes(config.maxFileSizeBytes)}).`, 'FILE_TOO_LARGE');
      case 'LIMIT_FILE_COUNT':
      case 'LIMIT_UNEXPECTED_FILE':
        return new HttpError(400, 'Envía un único archivo en el campo "file".', 'INVALID_UPLOAD');
      default:
        return new HttpError(400, 'La subida del archivo no es válida.', 'INVALID_UPLOAD');
    }
  }

  if (error?.type === 'entity.parse.failed') return new HttpError(400, 'El cuerpo de la petición no es un JSON válido.', 'INVALID_JSON');
  if (error?.type === 'entity.too.large') return new HttpError(413, 'El cuerpo de la petición es demasiado grande.', 'PAYLOAD_TOO_LARGE');
  if (error?.code === 'ENOENT') return new HttpError(404, 'El archivo ya no está disponible en el servidor.', 'FILE_MISSING');
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    return new HttpError(error.status, 'La petición no es válida.', 'BAD_REQUEST');
  }
  return new HttpError(500, 'Se produjo un error interno en el servidor. Inténtalo de nuevo.', 'INTERNAL_ERROR');
}

/** Middleware final para rutas inexistentes. */
export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'La página o el recurso solicitado no existe.', 'NOT_FOUND'));
}

/** Crea el middleware de errores (necesita la config para algunos mensajes). */
export function createErrorHandler(config) {
  // Express reconoce el manejador de errores por tener 4 parámetros.
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(error, req, res, next) {
    const httpError = toHttpError(error, config);
    if (httpError.status >= 500) console.error('[error]', error);

    // Si ya se empezó a enviar la respuesta (p. ej. una descarga cortada) sólo se cierra.
    if (res.headersSent) {
      res.end();
      return;
    }

    res.status(httpError.status);
    if (req.originalUrl.startsWith('/api/')) {
      res.json({ error: { code: httpError.code, message: httpError.message } });
    } else {
      res.type('html').send(renderErrorPage({ status: httpError.status, message: httpError.message }));
    }
  };
}
