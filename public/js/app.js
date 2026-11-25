/**
 * QR Office · lógica principal del frontend.
 *
 * Flujo:
 *  1. Al cargar se pide /api/config (formatos, límites, URL base de los QR).
 *  2. El usuario sube un documento (pestaña 1) o pega un enlace (pestaña 2).
 *  3. Se fija el "elemento actual" (state.current) y se pide la vista
 *     previa del QR en SVG; cada cambio de opciones la vuelve a pedir.
 *  4. Las descargas PNG/SVG se generan bajo demanda con las opciones vigentes.
 *  5. Todo lo generado se guarda en el historial local del navegador.
 */
import * as api from './api.js';
import { byId, el, icon, paintTile, formatBytes, formatDate, debounce, toast, copyText, canCopyImages, saveBlob, toFileSlug } from './ui.js';
import { DEFAULT_OPTIONS, readOptions, writeOptions, loadSavedOptions, saveOptions, getReadabilityWarnings } from './qr-options.js';
import { parseShareLink, detectProvider } from './link-providers.js';
import { loadHistory, addEntry, updateEntry, removeEntry, clearHistory, randomId } from './history.js';

/** Estado de la aplicación (una sola fuente de verdad para la interfaz). */
const state = {
  /** Respuesta de GET /api/config. */
  config: null,
  /** id de categoría → categoría del catálogo. */
  categories: new Map(),
  /** extensión → id de categoría. */
  extensionToCategory: new Map(),
  /**
   * Elemento que se muestra en la vista previa:
   *   { kind: 'document', document }  o  { kind: 'url', id, text, provider }
   */
  current: null,
  /** URL de objeto de la vista previa (se revoca al reemplazarla). */
  previewObjectUrl: null,
  /** Contador para descartar respuestas de vista previa que llegan tarde. */
  renderSeq: 0,
  /** Subida en curso: { abort } o null. */
  upload: null,
};

const dom = Object.fromEntries(
  [
    'networkStatus', 'tabFile', 'tabUrl', 'panelFile', 'panelUrl',
    'dropzone', 'fileInput', 'maxSize', 'uploadCard', 'uploadTile', 'uploadName', 'uploadMeta',
    'uploadProgress', 'uploadProgressBar', 'uploadStatus', 'uploadDismiss', 'formatList',
    'urlForm', 'urlInput', 'urlError',
    'optionsForm', 'fgHex', 'bgHex', 'marginOut', 'resetOptions', 'readabilityWarning',
    'previewBadge', 'previewFrame', 'qrImage', 'qrPlaceholder', 'previewDetails', 'previewName',
    'previewMeta', 'shareUrl', 'copyLink', 'localhostWarning',
    'downloadPng', 'downloadSvg', 'copyImage', 'openShare',
    'historyList', 'historyEmpty', 'clearHistory',
  ].map((id) => [id, byId(id)]),
);

// ---------------------------------------------------------------------------
// Utilidades sobre el estado
// ---------------------------------------------------------------------------

function getExtension(name) {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : '';
}

function categoryForExtension(extension) {
  return state.categories.get(state.extensionToCategory.get(extension));
}

/** URL base de los QR (la del servidor o, si aún no se conoce, el origen actual). */
function baseUrl() {
  return state.config?.baseUrl ?? window.location.origin;
}

/** Texto que codifica el QR actual. */
function currentText() {
  if (!state.current) return '';
  return state.current.kind === 'document' ? state.current.document.shareUrl : state.current.text;
}

/** Nombre base para los archivos descargados. */
function currentFileBase() {
  if (state.current?.kind === 'document') return `qr-${toFileSlug(state.current.document.originalName)}`;
  const hostname = state.current ? new URL(state.current.text).hostname : '';
  return `qr-${toFileSlug(state.current?.provider?.id ?? hostname, 'enlace')}`;
}

// ---------------------------------------------------------------------------
// Configuración y estado de red
// ---------------------------------------------------------------------------

function setNetworkStatus(kind, iconName, text, title) {
  dom.networkStatus.className = `net-status net-status--${kind}`;
  dom.networkStatus.replaceChildren(icon(iconName), el('span', { text }));
  dom.networkStatus.title = title;
}

function renderFormatList(categories) {
  dom.formatList.replaceChildren(
    ...categories.map((category) => {
      const tile = el('span', { className: 'tile', attrs: { 'aria-hidden': 'true' } });
      paintTile(tile, category);
      return el('li', { className: 'formats__item' }, [
        tile,
        el('div', {}, [
          el('div', { className: 'formats__label', text: `${category.label} · ${category.description}` }),
          el('div', { className: 'formats__ext', text: category.extensions.map((ext) => `.${ext}`).join('  ') }),
        ]),
      ]);
    }),
  );
}

function applyConfig(config) {
  state.config = config;
  for (const category of config.categories) {
    state.categories.set(category.id, category);
    for (const extension of category.extensions) state.extensionToCategory.set(extension, category.id);
  }

  dom.maxSize.textContent = formatBytes(config.maxFileSizeBytes);
  dom.fileInput.accept = config.accept;
  renderFormatList(config.categories);

  const host = new URL(config.baseUrl).host;
  if (!config.reachableFromOtherDevices) {
    setNetworkStatus('warn', 'monitor', `Sólo este equipo · ${host}`, 'Los QR apuntan a localhost: configura PUBLIC_BASE_URL para usarlos desde otros dispositivos.');
  } else if (config.publicInternet) {
    setNetworkStatus('ok', 'globe', `Público · ${host}`, 'Los QR funcionan desde cualquier dispositivo con Internet.');
  } else {
    setNetworkStatus('ok', 'wifi', `Red local · ${host}`, 'Los dispositivos conectados a la misma red pueden abrir los QR.');
  }
}

// ---------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------

function selectTab(name, { focusTab = false } = {}) {
  const pairs = [
    [dom.tabFile, dom.panelFile, name === 'file'],
    [dom.tabUrl, dom.panelUrl, name === 'url'],
  ];
  for (const [tab, panel, active] of pairs) {
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
    if (active && focusTab) tab.focus();
  }
}

// ---------------------------------------------------------------------------
// Subida de documentos
// ---------------------------------------------------------------------------

/** Validación previa en el navegador (el servidor vuelve a validar todo). */
function validateFileLocally(file) {
  if (file.size === 0) return 'El archivo está vacío.';
  if (!state.config) return null;
  const extension = getExtension(file.name);
  if (!state.extensionToCategory.has(extension)) {
    return `El formato ${extension ? `.${extension}` : 'sin extensión'} no está admitido. Revisa la lista de formatos admitidos.`;
  }
  if (file.size > state.config.maxFileSizeBytes) {
    return `El archivo pesa ${formatBytes(file.size)} y el máximo permitido es ${formatBytes(state.config.maxFileSizeBytes)}.`;
  }
  return null;
}

function setUploadStatus(text, kind = 'info') {
  dom.uploadStatus.textContent = text;
  dom.uploadStatus.className = `upload__status upload__status--${kind}`;
}

function setUploadProgress(fraction) {
  dom.uploadProgress.hidden = fraction === null;
  if (fraction !== null) dom.uploadProgressBar.style.width = `${Math.round(fraction * 100)}%`;
}

function showUploadCard(file) {
  const category = categoryForExtension(getExtension(file.name));
  paintTile(dom.uploadTile, category);
  dom.uploadName.textContent = file.name;
  dom.uploadName.title = file.name;
  dom.uploadMeta.textContent = `${formatBytes(file.size)} · ${category ? category.label : 'Formato no reconocido'}`;
  dom.uploadCard.hidden = false;
}

async function handleFile(file) {
  state.upload?.abort();
  showUploadCard(file);

  const problem = validateFileLocally(file);
  if (problem) {
    setUploadProgress(null);
    setUploadStatus(problem, 'error');
    toast(problem, 'error');
    return;
  }

  setUploadStatus('Subiendo y verificando el documento…');
  setUploadProgress(0);
  const upload = api.uploadDocument(file, {
    onProgress: (fraction) => {
      setUploadProgress(fraction);
      if (fraction >= 1) setUploadStatus('Verificando el documento en el servidor…');
    },
  });
  state.upload = upload;

  try {
    const { document: uploaded, deleteToken } = await upload.promise;
    addEntry({
      kind: 'document',
      id: uploaded.id,
      name: uploaded.originalName,
      category: uploaded.category,
      size: uploaded.size,
      createdAt: uploaded.createdAt,
      expiresAt: uploaded.expiresAt,
      deleteToken,
    });
    renderHistory();
    setCurrent({ kind: 'document', document: uploaded });
    setUploadStatus('Documento publicado. Ya puedes descargar o compartir el QR.', 'success');
    toast('Código QR generado', 'success');
  } catch (error) {
    if (error.code === 'ABORTED') {
      if (state.upload === upload) dom.uploadCard.hidden = true;
      return;
    }
    setUploadStatus(error.message, 'error');
    toast(error.message, 'error');
  } finally {
    if (state.upload === upload) {
      state.upload = null;
      setUploadProgress(null);
    }
    dom.fileInput.value = '';
  }
}

// ---------------------------------------------------------------------------
// Enlaces en la nube
// ---------------------------------------------------------------------------

function showUrlError(message) {
  dom.urlError.textContent = message;
  dom.urlError.hidden = !message;
  dom.urlInput.setAttribute('aria-invalid', String(Boolean(message)));
}

function handleUrlSubmit(event) {
  event.preventDefault();
  const result = parseShareLink(dom.urlInput.value);
  if (!result.ok) {
    showUrlError(result.error);
    dom.urlInput.focus();
    return;
  }
  showUrlError('');
  dom.urlInput.value = result.url;

  const existing = loadHistory().find((entry) => entry.kind === 'url' && entry.text === result.url);
  const entry = {
    kind: 'url',
    id: existing?.id ?? randomId(),
    name: result.provider?.label ?? new URL(result.url).hostname,
    text: result.url,
    createdAt: new Date().toISOString(),
  };
  addEntry(entry);
  renderHistory();
  setCurrent({ kind: 'url', id: entry.id, text: result.url, provider: result.provider });
  toast('Código QR generado', 'success');
}

// ---------------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------------

function setActionsEnabled(enabled) {
  for (const button of [dom.downloadPng, dom.downloadSvg, dom.copyImage]) button.disabled = !enabled;
  dom.openShare.classList.toggle('is-disabled', !enabled);
  dom.openShare.setAttribute('aria-disabled', String(!enabled));
  dom.openShare.tabIndex = enabled ? 0 : -1;
  if (!enabled) dom.openShare.href = '#';
}

function setCurrent(current) {
  state.current = current;
  const isDocument = current.kind === 'document';

  dom.previewBadge.textContent = isDocument ? 'Documento alojado' : 'Enlace externo';
  dom.previewBadge.className = `badge ${isDocument ? 'badge--doc' : 'badge--link'}`;

  if (isDocument) {
    const doc = current.document;
    dom.previewName.textContent = doc.originalName;
    dom.previewMeta.textContent = [
      `${doc.categoryLabel} · .${doc.extension}`,
      formatBytes(doc.size),
      doc.expiresAt ? `Disponible hasta ${formatDate(doc.expiresAt)}` : 'Sin caducidad',
      `${doc.downloads} ${doc.downloads === 1 ? 'descarga' : 'descargas'}`,
    ].join(' · ');
  } else {
    dom.previewName.textContent = current.provider?.label ?? new URL(current.text).hostname;
    dom.previewMeta.textContent = 'El QR abre directamente este enlace.';
  }
  dom.previewName.title = dom.previewName.textContent;

  const text = currentText();
  dom.shareUrl.textContent = text;
  dom.shareUrl.title = text;
  dom.previewDetails.hidden = false;
  dom.localhostWarning.hidden = !(isDocument && state.config && !state.config.reachableFromOtherDevices);

  setActionsEnabled(true);
  dom.openShare.href = text;
  renderPreview();
}

function clearCurrent() {
  state.current = null;
  state.renderSeq += 1;
  if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
  state.previewObjectUrl = null;
  dom.qrImage.hidden = true;
  dom.qrImage.removeAttribute('src');
  dom.qrPlaceholder.hidden = false;
  dom.previewDetails.hidden = true;
  dom.localhostWarning.hidden = true;
  dom.previewBadge.textContent = 'Sin generar';
  dom.previewBadge.className = 'badge';
  dom.previewFrame.style.background = '';
  setActionsEnabled(false);
}

/** Pide la vista previa en SVG (nítida a cualquier tamaño de pantalla). */
async function renderPreview() {
  if (!state.current) return;
  const seq = ++state.renderSeq;
  const options = readOptions(dom.optionsForm);
  dom.previewFrame.classList.add('is-loading');

  try {
    const blob = await api.renderQr(currentText(), options, 'svg');
    if (seq !== state.renderSeq) return; // Llegó una petición más reciente.
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = URL.createObjectURL(blob);
    dom.qrImage.src = state.previewObjectUrl;
    dom.qrImage.alt = `Código QR que abre ${currentText()}`;
    dom.qrImage.hidden = false;
    dom.qrPlaceholder.hidden = true;
    dom.previewFrame.style.background = options.bg;
  } catch (error) {
    if (seq === state.renderSeq) toast(error.message, 'error');
  } finally {
    if (seq === state.renderSeq) dom.previewFrame.classList.remove('is-loading');
  }
}

const renderPreviewSoon = debounce(renderPreview, 200);

async function downloadQr(format, button) {
  if (!state.current) return;
  const options = readOptions(dom.optionsForm);
  button.disabled = true;
  try {
    const blob = await api.renderQr(currentText(), options, format);
    saveBlob(blob, `${currentFileBase()}.${format}`);
    toast(format === 'png' ? `QR descargado (${options.size} × ${options.size} px)` : 'QR descargado en SVG (vectorial)', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = !state.current;
  }
}

async function copyQrImage() {
  if (!state.current) return;
  if (!canCopyImages()) {
    toast('El navegador sólo permite copiar imágenes en páginas https o en localhost. Usa «Descargar PNG».', 'info');
    return;
  }
  try {
    // Se pasa la promesa directamente: Safari exige crear el ClipboardItem durante el clic.
    const pngPromise = api.renderQr(currentText(), readOptions(dom.optionsForm), 'png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })]);
    toast('Imagen del QR copiada al portapapeles', 'success');
  } catch (error) {
    toast(error instanceof api.ApiError ? error.message : 'No se pudo copiar la imagen. Usa «Descargar PNG».', 'error');
  }
}

async function copyLinkText(text) {
  const copied = await copyText(text);
  toast(copied ? 'Enlace copiado al portapapeles' : 'No se pudo copiar. Selecciona el enlace y cópialo manualmente.', copied ? 'success' : 'error');
}

// ---------------------------------------------------------------------------
// Opciones
// ---------------------------------------------------------------------------

function syncOptionLabels() {
  const options = readOptions(dom.optionsForm);
  dom.fgHex.textContent = options.fg;
  dom.bgHex.textContent = options.bg;
  dom.marginOut.textContent = String(options.margin);

  const warnings = getReadabilityWarnings(options);
  dom.readabilityWarning.hidden = warnings.length === 0;
  dom.readabilityWarning.replaceChildren(icon('alert'), el('ul', {}, warnings.map((text) => el('li', { text }))));
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

function isUnavailable(entry) {
  return entry.kind === 'document' && (entry.unavailable || (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()));
}

function entryLink(entry) {
  return entry.kind === 'document' ? `${baseUrl()}/d/${entry.id}` : entry.text;
}

function historyActionButton(action, iconName, label, extraClass = '') {
  const button = el('button', { className: `icon-button ${extraClass}`.trim(), attrs: { type: 'button', 'data-action': action, 'aria-label': label, title: label } });
  button.append(icon(iconName));
  return button;
}

function historyTile(entry) {
  const tile = el('span', { className: 'tile', attrs: { 'aria-hidden': 'true' } });
  if (entry.kind === 'url') {
    tile.classList.add('tile--link');
    tile.append(icon('link'));
  } else {
    paintTile(tile, state.categories.get(entry.category));
  }
  return tile;
}

function renderHistoryItem(entry) {
  const unavailable = isUnavailable(entry);
  const item = el('li', { className: `history__item${unavailable ? ' is-unavailable' : ''}`, attrs: { 'data-id': entry.id } });

  let thumb;
  if (entry.kind === 'document' && !unavailable) {
    thumb = el('img', {
      className: 'history__thumb',
      attrs: { src: `/api/documents/${encodeURIComponent(entry.id)}/qr?format=svg&margin=1`, alt: '', loading: 'lazy', width: '46', height: '46' },
    });
    thumb.addEventListener('error', () => thumb.replaceWith(historyTile(entry)), { once: true });
  } else {
    thumb = historyTile(entry);
  }

  let meta;
  if (entry.kind === 'document') {
    const category = state.categories.get(entry.category);
    const availability = unavailable ? 'No disponible' : entry.expiresAt ? `Hasta ${formatDate(entry.expiresAt)}` : 'Sin caducidad';
    meta = [category?.label ?? 'Documento', formatBytes(entry.size), availability].join(' · ');
  } else {
    meta = `${new URL(entry.text).hostname} · ${formatDate(entry.createdAt)}`;
  }

  const actions = el('div', { className: 'history__actions' });
  if (!unavailable) {
    actions.append(historyActionButton('show', 'qr', 'Ver este QR'), historyActionButton('copy', 'copy', 'Copiar enlace'));
  }
  const deleteLabel = entry.kind === 'document' && !unavailable ? 'Eliminar del servidor' : 'Quitar del historial';
  actions.append(historyActionButton('delete', 'trash', deleteLabel, 'icon-button--danger'));

  item.append(
    thumb,
    el('div', { className: 'history__body' }, [
      el('p', { className: 'history__name', text: entry.name, attrs: { title: entry.name } }),
      el('p', { className: 'history__meta', text: meta }),
    ]),
    actions,
  );
  return item;
}

function renderHistory() {
  const entries = loadHistory();
  dom.historyList.replaceChildren(...entries.map(renderHistoryItem));
  dom.historyEmpty.hidden = entries.length > 0;
  dom.clearHistory.hidden = entries.length === 0;
}

function scrollPreviewIntoView() {
  if (window.matchMedia('(max-width: 979px)').matches) {
    dom.previewFrame.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function showHistoryEntry(entry) {
  if (entry.kind === 'url') {
    dom.urlInput.value = entry.text;
    setCurrent({ kind: 'url', id: entry.id, text: entry.text, provider: detectProvider(new URL(entry.text).hostname) });
    scrollPreviewIntoView();
    return;
  }
  try {
    const refreshed = await api.getDocument(entry.id);
    updateEntry(entry.id, { expiresAt: refreshed.expiresAt });
    setCurrent({ kind: 'document', document: refreshed });
    scrollPreviewIntoView();
  } catch (error) {
    if (error.status === 404 || error.status === 410) {
      updateEntry(entry.id, { unavailable: true });
      renderHistory();
    }
    toast(error.message, 'error');
  }
}

async function deleteHistoryEntry(entry) {
  const isCurrent = state.current && (state.current.kind === 'document' ? state.current.document.id : state.current.id) === entry.id;

  if (entry.kind === 'document' && !isUnavailable(entry)) {
    const confirmed = window.confirm(`¿Eliminar «${entry.name}» del servidor?\n\nEl código QR dejará de funcionar para todos.`);
    if (!confirmed) return;
    try {
      await api.deleteDocument(entry.id, entry.deleteToken);
      toast('Documento eliminado del servidor', 'success');
    } catch (error) {
      if (error.status !== 404) {
        toast(error.message, 'error');
        return;
      }
    }
  }

  removeEntry(entry.id);
  if (isCurrent) clearCurrent();
  renderHistory();
}

function handleHistoryClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.closest('[data-id]')?.dataset.id;
  const entry = loadHistory().find((candidate) => candidate.id === id);
  if (!entry) return;

  if (button.dataset.action === 'show') showHistoryEntry(entry);
  else if (button.dataset.action === 'copy') copyLinkText(entryLink(entry));
  else if (button.dataset.action === 'delete') deleteHistoryEntry(entry);
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function bindEvents() {
  // Pestañas (clic y flechas del teclado, según el patrón ARIA "tabs").
  dom.tabFile.addEventListener('click', () => selectTab('file'));
  dom.tabUrl.addEventListener('click', () => {
    selectTab('url');
    dom.urlInput.focus();
  });
  dom.tabFile.parentElement.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'file' : event.key === 'End' ? 'url' : dom.tabFile.getAttribute('aria-selected') === 'true' ? 'url' : 'file';
    selectTab(next, { focusTab: true });
  });

  // Selección y arrastre de archivos.
  dom.fileInput.addEventListener('change', () => {
    const file = dom.fileInput.files?.[0];
    if (file) handleFile(file);
  });
  for (const type of ['dragenter', 'dragover']) {
    dom.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dom.dropzone.classList.add('is-dragover');
    });
  }
  for (const type of ['dragleave', 'dragend', 'drop']) {
    dom.dropzone.addEventListener(type, () => dom.dropzone.classList.remove('is-dragover'));
  }
  dom.dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    if (files.length > 1) toast('Se procesa un documento cada vez: se usará el primero.', 'info');
    handleFile(files[0]);
  });
  // Evita que el navegador abra el archivo si se suelta fuera de la zona.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  dom.uploadDismiss.addEventListener('click', () => {
    if (state.upload) state.upload.abort();
    else dom.uploadCard.hidden = true;
  });

  // Enlaces.
  dom.urlForm.addEventListener('submit', handleUrlSubmit);
  dom.urlInput.addEventListener('input', () => showUrlError(''));

  // Opciones.
  dom.optionsForm.addEventListener('submit', (event) => event.preventDefault());
  dom.optionsForm.addEventListener('input', () => {
    syncOptionLabels();
    saveOptions(readOptions(dom.optionsForm));
    renderPreviewSoon();
  });
  dom.resetOptions.addEventListener('click', () => {
    writeOptions(dom.optionsForm, DEFAULT_OPTIONS);
    syncOptionLabels();
    saveOptions({ ...DEFAULT_OPTIONS });
    renderPreview();
    toast('Opciones restablecidas');
  });

  // Acciones de la vista previa.
  dom.downloadPng.addEventListener('click', () => downloadQr('png', dom.downloadPng));
  dom.downloadSvg.addEventListener('click', () => downloadQr('svg', dom.downloadSvg));
  dom.copyImage.addEventListener('click', copyQrImage);
  dom.copyLink.addEventListener('click', () => state.current && copyLinkText(currentText()));

  // Historial.
  dom.historyList.addEventListener('click', handleHistoryClick);
  dom.clearHistory.addEventListener('click', () => {
    const confirmed = window.confirm('¿Vaciar el historial de este navegador?\n\nLos documentos seguirán en el servidor hasta que caduquen.');
    if (!confirmed) return;
    clearHistory();
    renderHistory();
  });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function init() {
  writeOptions(dom.optionsForm, loadSavedOptions());
  syncOptionLabels();
  setActionsEnabled(false);
  bindEvents();
  renderHistory();

  try {
    applyConfig(await api.getConfig());
    renderHistory(); // Ahora ya se conocen los colores de cada categoría.
  } catch (error) {
    setNetworkStatus('error', 'alert', 'Servidor no disponible', error.message);
    toast(error.message, 'error');
  }
}

init();
