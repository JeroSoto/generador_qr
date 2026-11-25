/**
 * Error con código de estado HTTP. Las rutas lanzan HttpError y el
 * middleware errorHandler lo convierte en una respuesta JSON (API) o en
 * una página HTML (rutas públicas), con el mensaje en español.
 */
export class HttpError extends Error {
  /**
   * @param {number} status  Código HTTP (400, 404, 415…).
   * @param {string} message Mensaje legible para el usuario final.
   * @param {string} [code]  Código estable para que el cliente lo distinga.
   */
  constructor(status, message, code = 'ERROR') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
