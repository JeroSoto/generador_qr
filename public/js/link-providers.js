/**
 * Validación de enlaces y detección del servicio de almacenamiento en la
 * nube (OneDrive, SharePoint, Google Drive…), sólo informativa.
 */

const MAX_URL_LENGTH = 2000;

const PROVIDERS = [
  { id: 'onedrive', label: 'OneDrive', test: (host) => host === '1drv.ms' || host === 'onedrive.live.com' || host.endsWith('.onedrive.live.com') },
  { id: 'sharepoint', label: 'SharePoint / OneDrive para el trabajo', test: (host) => host.endsWith('.sharepoint.com') },
  { id: 'microsoft365', label: 'Microsoft 365', test: (host) => host.endsWith('office.com') || host.endsWith('cloud.microsoft') || host.endsWith('officeapps.live.com') },
  { id: 'google', label: 'Google Drive / Docs', test: (host) => host === 'docs.google.com' || host === 'drive.google.com' },
  { id: 'dropbox', label: 'Dropbox', test: (host) => host === 'dropbox.com' || host.endsWith('.dropbox.com') || host === 'db.tt' },
  { id: 'box', label: 'Box', test: (host) => host === 'box.com' || host.endsWith('.box.com') },
  { id: 'icloud', label: 'iCloud Drive', test: (host) => host === 'icloud.com' || host.endsWith('.icloud.com') },
];

/** Devuelve el servicio al que pertenece un nombre de host, o `null`. */
export function detectProvider(hostname) {
  const host = hostname.toLowerCase();
  const provider = PROVIDERS.find((candidate) => candidate.test(host));
  return provider ? { id: provider.id, label: provider.label } : null;
}

/**
 * Valida el texto introducido por el usuario. Si falta el protocolo se
 * asume https://.
 * @returns {{ok: true, url: string, provider: object|null} | {ok: false, error: string}}
 */
export function parseShareLink(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, error: 'Pega un enlace para generar el código QR.' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, error: `El enlace es demasiado largo (máximo ${MAX_URL_LENGTH} caracteres).` };

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    return { ok: false, error: 'El texto no es un enlace válido.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'Sólo se admiten enlaces que empiecen por http:// o https://.' };
  }
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    return { ok: false, error: 'El enlace no tiene un dominio válido (por ejemplo, onedrive.live.com).' };
  }
  return { ok: true, url: url.href, provider: detectProvider(url.hostname) };
}
