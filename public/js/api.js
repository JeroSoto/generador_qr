/**
 * Cliente HTTP de la API del servidor. Todas las funciones lanzan ApiError
 * con el mensaje en español que devuelve el servidor.
 */

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Comprueba que esté en marcha (npm start).';

/** Construye un ApiError a partir de una respuesta con error. */
async function toApiError(response) {
  try {
    const data = await response.json();
    if (data?.error?.message) return new ApiError(response.status, data.error.code, data.error.message);
  } catch {
    // La respuesta no era JSON: se usa el mensaje genérico.
  }
  return new ApiError(response.status, `HTTP_${response.status}`, `El servidor respondió con el error ${response.status}.`);
}

/** fetch() que traduce los fallos de red y las respuestas no 2xx a ApiError. */
async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError(0, 'NETWORK', NETWORK_ERROR_MESSAGE);
  }
  if (!response.ok) throw await toApiError(response);
  return response;
}

/** GET /api/config — catálogo de formatos, límites y URL base de los QR. */
export async function getConfig() {
  const response = await request('/api/config');
  return response.json();
}

/** GET /api/documents/:id — metadatos actualizados de un documento. */
export async function getDocument(id) {
  const response = await request(`/api/documents/${encodeURIComponent(id)}`);
  const data = await response.json();
  return data.document;
}

/** DELETE /api/documents/:id — requiere el token recibido al subir el archivo. */
export async function deleteDocument(id, deleteToken) {
  await request(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Delete-Token': deleteToken },
  });
}

/**
 * POST /api/qr — genera el QR de un texto.
 * @param {string} text Contenido a codificar.
 * @param {{size:number, margin:number, ecc:string, fg:string, bg:string}} options
 * @param {'png'|'svg'} format
 * @returns {Promise<Blob>}
 */
export async function renderQr(text, options, format = 'png') {
  const response = await request('/api/qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, format, ...options }),
  });
  return response.blob();
}

/**
 * POST /api/documents — sube un documento mostrando el progreso.
 * Se usa XMLHttpRequest porque fetch() no informa del progreso de subida.
 *
 * @param {File} file
 * @param {{onProgress?: (fraction: number) => void}} [callbacks]
 * @returns {{promise: Promise<{document: object, deleteToken: string}>, abort: () => void}}
 */
export function uploadDocument(file, { onProgress } = {}) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open('POST', '/api/documents');
    xhr.responseType = 'json';

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 201 && xhr.response?.document) {
        resolve(xhr.response);
        return;
      }
      const error = xhr.response?.error;
      reject(new ApiError(xhr.status, error?.code ?? `HTTP_${xhr.status}`, error?.message ?? `El servidor respondió con el error ${xhr.status}.`));
    });
    xhr.addEventListener('error', () => reject(new ApiError(0, 'NETWORK', NETWORK_ERROR_MESSAGE)));
    xhr.addEventListener('abort', () => reject(new ApiError(0, 'ABORTED', 'Subida cancelada.')));

    const formData = new FormData();
    formData.append('file', file, file.name);
    xhr.send(formData);
  });
  return { promise, abort: () => xhr.abort() };
}
