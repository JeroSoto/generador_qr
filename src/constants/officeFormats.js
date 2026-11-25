/**
 * Catálogo de formatos de oficina admitidos.
 *
 * Es la ÚNICA fuente de verdad sobre qué archivos acepta la aplicación:
 * lo usan el validador de subidas, el servidor de descargas (para el
 * Content-Type) y el frontend, que lo recibe a través de GET /api/config.
 *
 * Para admitir un formato nuevo basta con añadir una entrada a FORMATS
 * (y, si su firma binaria es nueva, una regla en fileValidator.js).
 */

/** Firmas binarias ("magic numbers") que se comprueban al subir un archivo. */
export const SIGNATURES = Object.freeze({
  /** Contenedor ZIP: Office Open XML (docx, xlsx, pptx…), OpenDocument y vsdx. */
  ZIP: 'zip',
  /** Compound File Binary (OLE2): formatos clásicos de Office 97-2003. */
  OLE2: 'ole2',
  /** Documento PDF. */
  PDF: 'pdf',
  /** Rich Text Format. */
  RTF: 'rtf',
  /** Bases de datos Jet/ACE de Access (mdb, accdb). */
  JET: 'jet',
  /** Sección de OneNote (.one). */
  ONENOTE: 'onenote',
  /** Texto plano (csv, txt): no tiene firma, se comprueba que no sea binario. */
  TEXT: 'text',
});

/**
 * Familias de documentos. `color` y `badge` se usan para pintar el icono
 * (un cuadrado de color con letras) tanto en la app como en la página de
 * descarga. `officeViewer` indica si Office para la Web puede previsualizarlo.
 */
export const CATEGORIES = Object.freeze([
  { id: 'word', label: 'Word', description: 'Documentos de texto', color: '#2B579A', badge: 'W', officeViewer: true },
  { id: 'excel', label: 'Excel', description: 'Hojas de cálculo', color: '#217346', badge: 'X', officeViewer: true },
  { id: 'powerpoint', label: 'PowerPoint', description: 'Presentaciones', color: '#C43E1C', badge: 'P', officeViewer: true },
  { id: 'access', label: 'Access', description: 'Bases de datos', color: '#A4373A', badge: 'A', officeViewer: false },
  { id: 'visio', label: 'Visio', description: 'Diagramas', color: '#3955A3', badge: 'V', officeViewer: false },
  { id: 'publisher', label: 'Publisher', description: 'Publicaciones', color: '#077568', badge: 'Pb', officeViewer: false },
  { id: 'project', label: 'Project', description: 'Planes de proyecto', color: '#31752F', badge: 'Pj', officeViewer: false },
  { id: 'onenote', label: 'OneNote', description: 'Blocs de notas', color: '#7719AA', badge: 'N', officeViewer: false },
  { id: 'outlook', label: 'Outlook', description: 'Mensajes de correo', color: '#0F6CBD', badge: 'O', officeViewer: false },
  { id: 'pdf', label: 'PDF', description: 'Documentos portátiles', color: '#B30B00', badge: 'PDF', officeViewer: false },
  { id: 'text', label: 'Texto', description: 'Texto plano y CSV', color: '#475569', badge: 'TXT', officeViewer: false },
]);

const { ZIP, OLE2, PDF, RTF, JET, ONENOTE, TEXT } = SIGNATURES;

/**
 * Formatos admitidos, indexados por extensión (en minúsculas y sin punto).
 * `macros: true` marca los formatos que pueden contener macros VBA; la
 * página de descarga muestra un aviso al destinatario.
 */
export const FORMATS = Object.freeze({
  // --- Word -------------------------------------------------------------
  doc: { category: 'word', signature: OLE2, mime: 'application/msword', name: 'Documento de Word 97-2003' },
  docx: { category: 'word', signature: ZIP, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'Documento de Word' },
  docm: { category: 'word', signature: ZIP, mime: 'application/vnd.ms-word.document.macroEnabled.12', name: 'Documento de Word con macros', macros: true },
  dot: { category: 'word', signature: OLE2, mime: 'application/msword', name: 'Plantilla de Word 97-2003' },
  dotx: { category: 'word', signature: ZIP, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template', name: 'Plantilla de Word' },
  dotm: { category: 'word', signature: ZIP, mime: 'application/vnd.ms-word.template.macroEnabled.12', name: 'Plantilla de Word con macros', macros: true },
  rtf: { category: 'word', signature: RTF, mime: 'application/rtf', name: 'Texto enriquecido (RTF)' },
  odt: { category: 'word', signature: ZIP, mime: 'application/vnd.oasis.opendocument.text', name: 'Texto OpenDocument' },

  // --- Excel ------------------------------------------------------------
  xls: { category: 'excel', signature: OLE2, mime: 'application/vnd.ms-excel', name: 'Libro de Excel 97-2003' },
  xlsx: { category: 'excel', signature: ZIP, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'Libro de Excel' },
  xlsm: { category: 'excel', signature: ZIP, mime: 'application/vnd.ms-excel.sheet.macroEnabled.12', name: 'Libro de Excel con macros', macros: true },
  xlsb: { category: 'excel', signature: ZIP, mime: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12', name: 'Libro binario de Excel', macros: true },
  xlt: { category: 'excel', signature: OLE2, mime: 'application/vnd.ms-excel', name: 'Plantilla de Excel 97-2003' },
  xltx: { category: 'excel', signature: ZIP, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template', name: 'Plantilla de Excel' },
  xltm: { category: 'excel', signature: ZIP, mime: 'application/vnd.ms-excel.template.macroEnabled.12', name: 'Plantilla de Excel con macros', macros: true },
  csv: { category: 'excel', signature: TEXT, mime: 'text/csv; charset=utf-8', name: 'Valores separados por comas (CSV)' },
  ods: { category: 'excel', signature: ZIP, mime: 'application/vnd.oasis.opendocument.spreadsheet', name: 'Hoja de cálculo OpenDocument' },

  // --- PowerPoint -------------------------------------------------------
  ppt: { category: 'powerpoint', signature: OLE2, mime: 'application/vnd.ms-powerpoint', name: 'Presentación de PowerPoint 97-2003' },
  pptx: { category: 'powerpoint', signature: ZIP, mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', name: 'Presentación de PowerPoint' },
  pptm: { category: 'powerpoint', signature: ZIP, mime: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12', name: 'Presentación de PowerPoint con macros', macros: true },
  pps: { category: 'powerpoint', signature: OLE2, mime: 'application/vnd.ms-powerpoint', name: 'Presentación con diapositivas 97-2003' },
  ppsx: { category: 'powerpoint', signature: ZIP, mime: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow', name: 'Presentación con diapositivas' },
  ppsm: { category: 'powerpoint', signature: ZIP, mime: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12', name: 'Presentación con diapositivas y macros', macros: true },
  pot: { category: 'powerpoint', signature: OLE2, mime: 'application/vnd.ms-powerpoint', name: 'Plantilla de PowerPoint 97-2003' },
  potx: { category: 'powerpoint', signature: ZIP, mime: 'application/vnd.openxmlformats-officedocument.presentationml.template', name: 'Plantilla de PowerPoint' },
  potm: { category: 'powerpoint', signature: ZIP, mime: 'application/vnd.ms-powerpoint.template.macroEnabled.12', name: 'Plantilla de PowerPoint con macros', macros: true },
  odp: { category: 'powerpoint', signature: ZIP, mime: 'application/vnd.oasis.opendocument.presentation', name: 'Presentación OpenDocument' },

  // --- Resto de la suite -----------------------------------------------
  mdb: { category: 'access', signature: JET, mime: 'application/vnd.ms-access', name: 'Base de datos de Access 2000-2003' },
  accdb: { category: 'access', signature: JET, mime: 'application/vnd.ms-access', name: 'Base de datos de Access' },
  vsd: { category: 'visio', signature: OLE2, mime: 'application/vnd.visio', name: 'Dibujo de Visio 2003-2010' },
  vsdx: { category: 'visio', signature: ZIP, mime: 'application/vnd.ms-visio.drawing', name: 'Dibujo de Visio' },
  pub: { category: 'publisher', signature: OLE2, mime: 'application/vnd.ms-publisher', name: 'Publicación de Publisher' },
  mpp: { category: 'project', signature: OLE2, mime: 'application/vnd.ms-project', name: 'Proyecto de Project' },
  one: { category: 'onenote', signature: ONENOTE, mime: 'application/onenote', name: 'Sección de OneNote' },
  msg: { category: 'outlook', signature: OLE2, mime: 'application/vnd.ms-outlook', name: 'Mensaje de Outlook' },

  // --- Formatos de oficina habituales ----------------------------------
  pdf: { category: 'pdf', signature: PDF, mime: 'application/pdf', name: 'Documento PDF' },
  txt: { category: 'text', signature: TEXT, mime: 'text/plain; charset=utf-8', name: 'Documento de texto' },
});

/** Devuelve la categoría con el id indicado o `undefined`. */
export function getCategory(id) {
  return CATEGORIES.find((category) => category.id === id);
}

/** Devuelve la definición del formato para una extensión o `undefined`. */
export function getFormat(extension) {
  return Object.hasOwn(FORMATS, extension) ? FORMATS[extension] : undefined;
}

/**
 * Catálogo pensado para el frontend: cada categoría con la lista de sus
 * extensiones, más la cadena lista para el atributo `accept` del <input>.
 */
export function getPublicCatalog() {
  const categories = CATEGORIES.map((category) => ({
    ...category,
    extensions: Object.entries(FORMATS)
      .filter(([, format]) => format.category === category.id)
      .map(([extension]) => extension),
  }));
  const accept = Object.keys(FORMATS)
    .map((extension) => `.${extension}`)
    .join(',');
  return { categories, accept };
}
