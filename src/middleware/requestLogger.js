/**
 * Registro mínimo de peticiones en consola: método, ruta, estado y duración.
 * No registra cuerpos de petición (podrían contener enlaces privados).
 */
export function requestLogger() {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(1)} ms`);
    });
    next();
  };
}
