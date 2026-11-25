/**
 * Utilidades de red para decidir a qué URL apunta cada código QR.
 *
 * Un QR que apunte a "localhost" sólo funciona en el propio equipo: el
 * teléfono que lo escanee intentará conectarse a sí mismo. Por eso, si no
 * se configura PUBLIC_BASE_URL, se usa la IP del equipo en la red local
 * (p. ej. http://192.168.1.20:3000), accesible desde otros dispositivos
 * conectados a la misma Wi-Fi.
 */
import dgram from 'node:dgram';
import os from 'node:os';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Adaptadores virtuales o de VPN que nunca son la red Wi-Fi/cableada real. */
const VIRTUAL_ADAPTER = /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|tailscale|zerotier|hamachi|vpn|\btap\b|\btun\b|utun|bluetooth|npcap|loopback/i;
/** Nombres habituales de la interfaz física principal. */
const PHYSICAL_ADAPTER = /^(wi-?fi|wlan\d*|wireless|ethernet|eth\d+|en\d+|wl\w*)$/i;

/**
 * Normaliza una URL base: exige http/https y elimina la barra final.
 * Devuelve `null` si el valor está vacío y lanza un error si es inválido.
 */
export function normalizeBaseUrl(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error(`PUBLIC_BASE_URL no es una URL válida: "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PUBLIC_BASE_URL debe empezar por http:// o https://');
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

/**
 * Elige por heurística la IPv4 de la red local cuando no se puede consultar
 * la ruta (ver getRouteIPv4). Descarta adaptadores virtuales (VMware,
 * VirtualBox, WSL, VPN…) y prefiere los nombres de interfaz físicos.
 */
export function getLanIPv4(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal || info.address.startsWith('169.254.')) continue;
      let score = 0;
      if (VIRTUAL_ADAPTER.test(name)) score -= 10;
      if (PHYSICAL_ADAPTER.test(name)) score += 5;
      if (info.address.startsWith('192.168.56.')) score -= 5; // Red por defecto de VirtualBox.
      if (isPrivateIPv4(info.address)) score += 1;
      candidates.push({ address: info.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}

/**
 * Pregunta al sistema operativo qué IP local usaría para salir de la red
 * (la de la interfaz con la ruta por defecto, normalmente el Wi-Fi o el
 * cable). "Conectar" un socket UDP sólo consulta la tabla de rutas: no se
 * envía ningún paquete. El destino es 192.0.2.1, una dirección reservada
 * para documentación (RFC 5737) que no pertenece a nadie.
 *
 * @returns {Promise<string|null>} null si no hay ruta por defecto.
 */
export function getRouteIPv4(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const finish = (address) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(address);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.on('error', () => finish(null));
    socket.connect(9, '192.0.2.1', () => {
      try {
        const { address } = socket.address();
        finish(address && address !== '0.0.0.0' && !address.startsWith('169.254.') ? address : null);
      } catch {
        finish(null);
      }
    });
  });
}

/** IPv4 de la red local: primero la de la ruta por defecto y, si no, la heurística. */
export async function detectLanIPv4() {
  return (await getRouteIPv4()) ?? getLanIPv4();
}

/**
 * URL base por defecto cuando no se define PUBLIC_BASE_URL.
 * Si el servidor sólo escucha en loopback, la red local no puede llegar a
 * él y se devuelve localhost.
 *
 * @param {number} port
 * @param {string} host       Dirección en la que escucha el servidor.
 * @param {string|null} lanAddress IPv4 detectada con detectLanIPv4().
 */
export function buildDefaultBaseUrl(port, host, lanAddress) {
  if (LOOPBACK_HOSTS.has(host) || !lanAddress) return `http://localhost:${port}`;
  return `http://${lanAddress}:${port}`;
}

/**
 * URL base que se usará para construir enlaces en una petición concreta.
 * Prioridad: la fijada al arrancar (PUBLIC_BASE_URL o IP de la red local)
 * y, en su defecto, el host con el que se ha hecho la petición.
 */
export function getRequestBaseUrl(req) {
  return req.app.locals.baseUrl ?? `${req.protocol}://${req.get('host')}`;
}

/** Indica si una IPv4 pertenece a un rango privado, loopback o enlace local. */
function isPrivateIPv4(hostname) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // CGNAT
  );
}

/**
 * Clasifica una URL base:
 *  - `reachableFromOtherDevices`: false si apunta a localhost.
 *  - `publicInternet`: true si parece accesible desde Internet (necesario
 *    para el visor de Office para la Web, que descarga el archivo desde
 *    los servidores de Microsoft).
 */
export function describeBaseUrl(baseUrl) {
  const { hostname } = new URL(baseUrl);
  const host = hostname.toLowerCase();
  const isLoopback = LOOPBACK_HOSTS.has(host) || host.startsWith('127.');
  const isLocalName = host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.localhost') || !host.includes('.');
  const isPrivate = isLoopback || isLocalName || isPrivateIPv4(host) || host.startsWith('[');
  return {
    reachableFromOtherDevices: !isLoopback,
    publicInternet: !isPrivate,
  };
}
