/**
 * Plantillas HTML renderizadas en el servidor: la página de descarga a la
 * que lleva el QR y la página de error. Todo valor dinámico pasa por
 * escapeHtml() para evitar inyección de HTML (XSS).
 */
import { escapeHtml, formatBytes, formatDate } from '../utils/format.js';

/** Estructura común de las páginas públicas. */
function layout({ title, body }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/share.css">
</head>
<body>
  <main class="share">
${body}
    <p class="share__footer">Compartido con <a href="/">QR Office</a></p>
  </main>
</body>
</html>`;
}

/** Icono de la familia de documento: cuadrado de color con sus siglas. */
function renderTile(category) {
  const color = category?.color ?? '#475569';
  const badge = category?.badge ?? 'DOC';
  return `<span class="tile" style="--tile-color:${escapeHtml(color)}" aria-hidden="true">${escapeHtml(badge)}</span>`;
}

/**
 * Página de descarga de un documento.
 * @param {object} params
 * @param {object} params.document  Documento público (toPublicDocument).
 * @param {object} params.category  Categoría del catálogo.
 * @param {object} params.format    Formato del catálogo.
 * @param {string|null} params.viewerUrl Enlace a Office para la Web o null.
 */
export function renderDownloadPage({ document, category, format, viewerUrl }) {
  const expiry = document.expiresAt
    ? `<div><dt>Disponible hasta</dt><dd>${escapeHtml(formatDate(document.expiresAt))}</dd></div>`
    : '';

  const macroWarning = format?.macros
    ? `
      <p class="notice notice--warning" role="note">
        <strong>Contiene macros.</strong> Ábrelo sólo si confías en quien te lo envió y habilita las macros únicamente si las necesitas.
      </p>`
    : '';

  const viewerButton = viewerUrl
    ? `<a class="button button--secondary" href="${escapeHtml(viewerUrl)}" target="_blank" rel="noopener noreferrer">Ver en línea con Office para la Web</a>`
    : '';

  const body = `
    <article class="card">
      <header class="card__header">
        ${renderTile(category)}
        <div class="card__title">
          <p class="eyebrow">${escapeHtml(category?.label ?? 'Documento')} · .${escapeHtml(document.extension)}</p>
          <h1>${escapeHtml(document.originalName)}</h1>
        </div>
      </header>

      <dl class="meta">
        <div><dt>Tipo</dt><dd>${escapeHtml(document.formatName)}</dd></div>
        <div><dt>Tamaño</dt><dd>${escapeHtml(formatBytes(document.size))}</dd></div>
        <div><dt>Subido</dt><dd>${escapeHtml(formatDate(document.createdAt))}</dd></div>
        ${expiry}
        <div><dt>Descargas</dt><dd>${escapeHtml(document.downloads)}</dd></div>
      </dl>
      ${macroWarning}
      <div class="actions">
        <a class="button button--primary" href="${escapeHtml(document.downloadUrl)}">Descargar documento</a>
        ${viewerButton}
      </div>

      <details class="integrity">
        <summary>Verificar integridad (SHA-256)</summary>
        <code>${escapeHtml(document.sha256)}</code>
        <p>Si calculas el SHA-256 del archivo descargado debe coincidir con este valor.</p>
      </details>
    </article>`;

  return layout({ title: `${document.originalName} · QR Office`, body });
}

const ERROR_TITLES = {
  400: 'Petición no válida',
  404: 'Documento no encontrado',
  410: 'Enlace caducado',
  413: 'Archivo demasiado grande',
  415: 'Formato no admitido',
  429: 'Demasiadas peticiones',
  500: 'Algo salió mal',
};

/** Página de error genérica. */
export function renderErrorPage({ status, message }) {
  const title = ERROR_TITLES[status] ?? ERROR_TITLES[500];
  const body = `
    <article class="card card--error">
      <p class="eyebrow">Error ${escapeHtml(status)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <div class="actions">
        <a class="button button--secondary" href="/">Ir al generador de QR</a>
      </div>
    </article>`;
  return layout({ title: `${title} · QR Office`, body });
}
