import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultBaseUrl, describeBaseUrl, getLanIPv4, getRouteIPv4, normalizeBaseUrl } from '../src/utils/network.js';
import { decodeMulterFilename, sanitizeFilename } from '../src/utils/format.js';

// Caso real de un portátil con VMware, VirtualBox, Tailscale y Wi-Fi.
const fakeInterfaces = {
  Tailscale: [{ family: 'IPv4', address: '169.254.83.107', internal: false }],
  'Ethernet 2': [{ family: 'IPv4', address: '192.168.56.1', internal: false }],
  'VMware Network Adapter VMnet1': [{ family: 'IPv4', address: '192.168.241.1', internal: false }],
  'vEthernet (WSL)': [{ family: 'IPv4', address: '172.28.32.1', internal: false }],
  'Wi-Fi': [
    { family: 'IPv6', address: 'fe80::1', internal: false },
    { family: 'IPv4', address: '172.20.10.7', internal: false },
  ],
  'Loopback Pseudo-Interface 1': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
};

test('getLanIPv4 descarta adaptadores virtuales y elige el Wi-Fi', () => {
  assert.equal(getLanIPv4(fakeInterfaces), '172.20.10.7');
  assert.equal(getLanIPv4({}), null);
});

test('getRouteIPv4 devuelve una IPv4 local o null, sin lanzar errores', async () => {
  const address = await getRouteIPv4();
  assert.ok(address === null || /^\d{1,3}(\.\d{1,3}){3}$/.test(address));
});

test('buildDefaultBaseUrl usa la IP de la red local salvo si se escucha en loopback', () => {
  assert.equal(buildDefaultBaseUrl(3000, '0.0.0.0', '172.20.10.7'), 'http://172.20.10.7:3000');
  assert.equal(buildDefaultBaseUrl(3000, '127.0.0.1', '172.20.10.7'), 'http://localhost:3000');
  assert.equal(buildDefaultBaseUrl(3000, '0.0.0.0', null), 'http://localhost:3000');
});

test('describeBaseUrl clasifica localhost, red local e Internet', () => {
  assert.deepEqual(describeBaseUrl('http://localhost:3000'), { reachableFromOtherDevices: false, publicInternet: false });
  assert.deepEqual(describeBaseUrl('http://192.168.1.37:3000'), { reachableFromOtherDevices: true, publicInternet: false });
  assert.deepEqual(describeBaseUrl('http://mi-pc.local:3000'), { reachableFromOtherDevices: true, publicInternet: false });
  assert.deepEqual(describeBaseUrl('https://qr.ejemplo.com'), { reachableFromOtherDevices: true, publicInternet: true });
});

test('normalizeBaseUrl valida y elimina la barra final', () => {
  assert.equal(normalizeBaseUrl(''), null);
  assert.equal(normalizeBaseUrl('https://qr.ejemplo.com/'), 'https://qr.ejemplo.com');
  assert.equal(normalizeBaseUrl('https://ejemplo.com/qr/'), 'https://ejemplo.com/qr');
  assert.throws(() => normalizeBaseUrl('ftp://ejemplo.com'));
  assert.throws(() => normalizeBaseUrl('no es una url'));
});

test('decodeMulterFilename recupera los acentos y sanitizeFilename limpia el nombre', () => {
  const mojibake = Buffer.from('Informe año.docx', 'utf8').toString('latin1');
  assert.equal(decodeMulterFilename(mojibake), 'Informe año.docx');
  assert.equal(decodeMulterFilename('simple.xlsx'), 'simple.xlsx');
  assert.equal(sanitizeFilename('..\\..\\Windows\\win.ini'), 'win.ini');
  assert.equal(sanitizeFilename('nombre<>:"|?*.docx'), 'nombre.docx');
  assert.equal(sanitizeFilename(''), 'documento');
  const long = sanitizeFilename(`${'a'.repeat(300)}.pptx`);
  assert.equal(long.length, 150);
  assert.ok(long.endsWith('.pptx'));
});
