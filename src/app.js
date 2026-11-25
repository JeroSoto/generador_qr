/**
 * Composición de la aplicación Express.
 *
 * Se separa de server.js para poder crear la aplicación en las pruebas
 * sin abrir un puerto fijo ni programar tareas periódicas.
 */
import express from 'express';
import helmet from 'helmet';
import { DocumentStore } from './services/documentStore.js';
import { createApiRouter } from './routes/api.js';
import { createShareRouter } from './routes/share.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';

/**
 * Crea la aplicación y su almacén de documentos.
 *
 * @param {object} config Configuración (ver loadConfig en src/config.js).
 * @param {object} [options]
 * @param {() => number} [options.now] Reloj inyectable para el almacén.
 * @returns {Promise<{app: import('express').Express, store: DocumentStore}>}
 */
export async function createApp(config, { now } = {}) {
  const store = new DocumentStore({ dataDir: config.dataDir, uploadsDir: config.uploadsDir, now });
  await store.init();

  const app = express();
  app.set('trust proxy', config.trustProxy);

  // URL base de los QR. server.js la completa con la IP de la red local al arrancar.
  app.locals.baseUrl = config.publicBaseUrl ?? null;
  app.locals.baseUrlSource = config.publicBaseUrl ? 'env' : 'request';

  const servedOverHttps = Boolean(config.publicBaseUrl?.startsWith('https://'));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          // 'unsafe-inline' sólo para estilos: la página de descarga fija el color del icono con style="".
          'style-src': ["'self'", "'unsafe-inline'"],
          // En la red local se sirve por http; forzar https rompería la carga de recursos.
          'upgrade-insecure-requests': null,
        },
      },
      ...(servedOverHttps ? {} : { strictTransportSecurity: false }),
    }),
  );

  if (config.logRequests) app.use(requestLogger());

  app.use(express.static(config.publicDir, { index: 'index.html' }));
  app.use('/api', createApiRouter({ config, store }));
  app.use(createShareRouter({ store }));

  app.use(notFoundHandler);
  app.use(createErrorHandler(config));

  return { app, store };
}
