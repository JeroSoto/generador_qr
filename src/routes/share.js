/**
 * Rutas públicas a las que llega quien escanea el QR:
 *   GET /d/:id           Página de descarga (HTML).
 *   GET /d/:id/download  Archivo original.
 */
import express from 'express';
import { getCategory, getFormat } from '../constants/officeFormats.js';
import { getActiveDocument, toPublicDocument } from '../services/documentPresenter.js';
import { renderDownloadPage } from '../views/pages.js';
import { describeBaseUrl, getRequestBaseUrl } from '../utils/network.js';

const OFFICE_VIEWER_URL = 'https://view.officeapps.live.com/op/view.aspx?src=';

/**
 * @param {object} deps
 * @param {import('../services/documentStore.js').DocumentStore} deps.store
 */
export function createShareRouter({ store }) {
  const router = express.Router();

  router.get('/d/:id', (req, res) => {
    const record = getActiveDocument(store, req.params.id);
    const baseUrl = getRequestBaseUrl(req);
    const document = toPublicDocument(record, baseUrl);
    const category = getCategory(record.category);

    // Office para la Web descarga el archivo desde los servidores de
    // Microsoft, así que sólo se ofrece si la URL es accesible desde Internet.
    const viewerUrl =
      category?.officeViewer && describeBaseUrl(baseUrl).publicInternet
        ? `${OFFICE_VIEWER_URL}${encodeURIComponent(document.downloadUrl)}`
        : null;

    res
      .set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' })
      .type('html')
      .send(renderDownloadPage({ document, category, format: getFormat(record.extension), viewerUrl }));
  });

  router.get('/d/:id/download', (req, res, next) => {
    const record = getActiveDocument(store, req.params.id);

    // Sólo cuenta las descargas completas (no las peticiones parciales Range).
    res.on('finish', () => {
      if (req.method === 'GET' && res.statusCode === 200) {
        store.registerDownload(record.id).catch((error) => console.error('[descargas] No se pudo actualizar el contador:', error));
      }
    });

    // Content-Type se fija antes porque el archivo en disco no tiene extensión.
    res.set({ 'Content-Type': record.mimeType, 'Cache-Control': 'private, no-cache', 'X-Robots-Tag': 'noindex, nofollow' });
    res.download(store.filePath(record.id), record.originalName, { cacheControl: false }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  });

  return router;
}
