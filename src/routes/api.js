/**
 * API REST bajo el prefijo /api. Todas las respuestas son JSON excepto las
 * de los endpoints de QR, que devuelven la imagen (PNG o SVG).
 */
import fs from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { getPublicCatalog } from '../constants/officeFormats.js';
import { validateOfficeFile } from '../services/fileValidator.js';
import { QR_DEFAULTS, QR_LIMITS, normalizeQrOptions, renderQr } from '../services/qrService.js';
import { buildShareUrl, getActiveDocument, toPublicDocument } from '../services/documentPresenter.js';
import { HttpError } from '../utils/httpError.js';
import { decodeMulterFilename, sanitizeFilename, stripExtension } from '../utils/format.js';
import { generateId, generateToken, hashFile, hashToken, safeEqualHex } from '../utils/security.js';
import { describeBaseUrl, getRequestBaseUrl } from '../utils/network.js';

const HOUR_MS = 60 * 60 * 1000;

/** Crea un limitador de peticiones con respuesta JSON en español. */
function createLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message } },
  });
}

/** Envía la imagen del QR; si se indica `downloadName`, fuerza la descarga. */
function sendQrImage(res, image, downloadName) {
  if (downloadName) res.attachment(`${downloadName}.${image.extension}`);
  res.set('Cache-Control', 'no-store');
  res.type(image.contentType);
  res.send(image.body);
}

/**
 * @param {object} deps
 * @param {object} deps.config Configuración (ver src/config.js).
 * @param {import('../services/documentStore.js').DocumentStore} deps.store
 */
export function createApiRouter({ config, store }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: store.tmpDir,
      // Nombre aleatorio: el nombre original nunca se usa como ruta en disco.
      filename: (_req, _file, callback) => callback(null, `${generateToken()}.part`),
    }),
    limits: { fileSize: config.maxFileSizeBytes, files: 1, fields: 2 },
  });

  const uploadLimiter = createLimiter(
    config.rateLimit.windowMs,
    config.rateLimit.uploads,
    'Has subido demasiados archivos en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
  );
  const qrLimiter = createLimiter(
    config.rateLimit.windowMs,
    config.rateLimit.qr,
    'Se han generado demasiados códigos QR en poco tiempo. Espera unos minutos.',
  );

  /** Estado del servicio (útil para monitorización). */
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), documents: store.size });
  });

  /** Configuración que necesita el frontend para pintarse. */
  router.get('/config', (req, res) => {
    const baseUrl = getRequestBaseUrl(req);
    res.json({
      baseUrl,
      baseUrlSource: req.app.locals.baseUrlSource ?? 'request',
      ...describeBaseUrl(baseUrl),
      maxFileSizeBytes: config.maxFileSizeBytes,
      fileTtlHours: config.fileTtlHours,
      ...getPublicCatalog(),
      qr: { defaults: QR_DEFAULTS, limits: QR_LIMITS },
    });
  });

  /** Subida de un documento (multipart/form-data, campo "file"). */
  router.post('/documents', uploadLimiter, upload.single('file'), async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'No se recibió ningún archivo. Envíalo en el campo "file".', 'NO_FILE');
    }

    const tempPath = req.file.path;
    try {
      if (req.file.size === 0) throw new HttpError(400, 'El archivo está vacío.', 'EMPTY_FILE');

      const originalName = sanitizeFilename(decodeMulterFilename(req.file.originalname));
      const { extension, format } = await validateOfficeFile(tempPath, originalName);
      const sha256 = await hashFile(tempPath);

      // La colisión es prácticamente imposible (72 bits), pero se descarta igualmente.
      let id = generateId();
      while (store.has(id)) id = generateId();

      const deleteToken = generateToken();
      const createdAt = new Date();
      const record = {
        id,
        originalName,
        extension,
        category: format.category,
        mimeType: format.mime,
        size: req.file.size,
        sha256,
        createdAt: createdAt.toISOString(),
        expiresAt: config.fileTtlHours > 0 ? new Date(createdAt.getTime() + config.fileTtlHours * HOUR_MS).toISOString() : null,
        downloads: 0,
        deleteTokenHash: hashToken(deleteToken),
      };

      await store.create(record, tempPath);
      res
        .status(201)
        .location(`/api/documents/${id}`)
        .json({ document: toPublicDocument(record, getRequestBaseUrl(req)), deleteToken });
    } finally {
      // Si algo falló, el temporal sigue ahí; si todo fue bien, ya se movió.
      await fs.rm(tempPath, { force: true });
    }
  });

  /** Metadatos públicos de un documento. */
  router.get('/documents/:id', (req, res) => {
    const record = getActiveDocument(store, req.params.id);
    res.json({ document: toPublicDocument(record, getRequestBaseUrl(req)) });
  });

  /** QR que apunta a la página de descarga del documento. */
  router.get('/documents/:id/qr', qrLimiter, async (req, res) => {
    const record = getActiveDocument(store, req.params.id);
    const options = normalizeQrOptions(req.query);
    const image = await renderQr(buildShareUrl(getRequestBaseUrl(req), record.id), options);
    const downloadName = req.query.download ? `qr-${stripExtension(record.originalName)}` : null;
    sendQrImage(res, image, downloadName);
  });

  /** Elimina un documento. Requiere el token entregado al subirlo. */
  router.delete('/documents/:id', async (req, res) => {
    const record = store.get(req.params.id);
    if (!record) throw new HttpError(404, 'El documento no existe o ya se eliminó.', 'DOCUMENT_NOT_FOUND');

    const token = req.get('X-Delete-Token');
    if (!token) throw new HttpError(401, 'Falta el token de eliminación (cabecera X-Delete-Token).', 'MISSING_TOKEN');
    if (!safeEqualHex(hashToken(token), record.deleteTokenHash)) {
      throw new HttpError(403, 'El token de eliminación no es válido para este documento.', 'INVALID_TOKEN');
    }

    await store.remove(record.id);
    res.status(204).end();
  });

  /** QR de un texto arbitrario (se usa para enlaces de OneDrive, SharePoint, etc.). */
  router.post('/qr', qrLimiter, express.json({ limit: '16kb' }), async (req, res) => {
    const { text, ...rawOptions } = req.body ?? {};
    const options = normalizeQrOptions(rawOptions);
    const image = await renderQr(text, options);
    sendQrImage(res, image, null);
  });

  return router;
}
