import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QR_DEFAULTS, normalizeQrOptions, renderQr } from '../src/services/qrService.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('normalizeQrOptions completa los valores por defecto', () => {
  assert.deepEqual(normalizeQrOptions({}), { ...QR_DEFAULTS });
});

test('normalizeQrOptions acepta valores de query string y los normaliza', () => {
  const options = normalizeQrOptions({ format: 'SVG', size: '1024', margin: '2', ecc: 'h', fg: '1f5fbf', bg: '#ffffff' });
  assert.deepEqual(options, { format: 'svg', size: 1024, margin: 2, ecc: 'H', fg: '#1F5FBF', bg: '#FFFFFF' });
});

test('normalizeQrOptions rechaza valores fuera de rango o mal formados', () => {
  assert.throws(() => normalizeQrOptions({ size: '50' }), { status: 400 });
  assert.throws(() => normalizeQrOptions({ size: '512.5' }), { status: 400 });
  assert.throws(() => normalizeQrOptions({ margin: '11' }), { status: 400 });
  assert.throws(() => normalizeQrOptions({ ecc: 'X' }), { status: 400 });
  assert.throws(() => normalizeQrOptions({ format: 'gif' }), { status: 400 });
  assert.throws(() => normalizeQrOptions({ fg: 'rojo' }), { status: 400 });
  assert.throws(() => normalizeQrOptions({ fg: '#000000', bg: '#000000' }), { status: 400 });
});

test('renderQr genera un PNG válido', async () => {
  const image = await renderQr('https://example.com/d/abc', normalizeQrOptions({ size: 256 }));
  assert.equal(image.contentType, 'image/png');
  assert.ok(Buffer.isBuffer(image.body));
  assert.ok(image.body.subarray(0, 8).equals(PNG_SIGNATURE));
});

test('renderQr genera un SVG con los colores indicados', async () => {
  const image = await renderQr('https://example.com', normalizeQrOptions({ format: 'svg', fg: '#112233' }));
  assert.match(image.contentType, /^image\/svg\+xml/);
  assert.match(image.body, /<svg[\s\S]*<\/svg>/);
  assert.match(image.body, /#112233/i);
});

test('renderQr rechaza textos vacíos o demasiado largos', async () => {
  const options = normalizeQrOptions({});
  await assert.rejects(renderQr('', options), { status: 400 });
  await assert.rejects(renderQr('x'.repeat(3000), options), { status: 422 });
  // Cabe con nivel L pero no con H.
  await assert.rejects(renderQr('x'.repeat(2000), normalizeQrOptions({ ecc: 'H' })), { status: 422 });
});
