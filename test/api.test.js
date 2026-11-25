import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFile, startTestServer, uploadFile } from './helpers.js';

describe('API y página de descarga', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  test('GET /api/health responde ok', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  });

  test('GET /api/config expone catálogo, límites y URL base', async () => {
    const config = await (await fetch(`${server.baseUrl}/api/config`)).json();
    assert.equal(config.baseUrl, server.baseUrl);
    // El servidor de pruebas escucha en 127.0.0.1: sólo accesible desde este equipo.
    assert.equal(config.reachableFromOtherDevices, false);
    assert.equal(config.publicInternet, false);
    assert.ok(config.categories.some((category) => category.id === 'word' && category.extensions.includes('docx')));
    assert.ok(config.accept.includes('.pptx'));
    assert.equal(config.qr.defaults.size, 512);
  });

  test('sirve el frontend y las cabeceras de seguridad', async () => {
    const response = await fetch(`${server.baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /QR Office/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.doesNotMatch(response.headers.get('content-security-policy'), /upgrade-insecure-requests/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  });

  test('ciclo completo: subir, ver página, descargar, QR y eliminar', async () => {
    const content = sampleFile('zip', 4096);
    const { response, body } = await uploadFile(server.baseUrl, content, 'Informe año 2026.docx');
    assert.equal(response.status, 201);
    assert.ok(body.deleteToken);

    const { document } = body;
    assert.equal(document.originalName, 'Informe año 2026.docx');
    assert.equal(document.category, 'word');
    assert.equal(document.size, content.length);
    assert.equal(document.shareUrl, `${server.baseUrl}/d/${document.id}`);
    assert.equal(document.deleteTokenHash, undefined, 'el hash del token nunca se expone');

    // Página de descarga (lo que ve quien escanea el QR).
    const page = await fetch(document.shareUrl);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Informe año 2026\.docx/);
    assert.match(html, /Descargar documento/);
    assert.doesNotMatch(html, /Office para la Web/, 'en red local no se ofrece el visor de Office');

    // Descarga del archivo original.
    const download = await fetch(document.downloadUrl);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.match(download.headers.get('content-disposition'), /attachment/);
    assert.match(download.headers.get('content-disposition'), /filename\*=UTF-8''Informe%20a%C3%B1o%202026\.docx/);
    assert.ok(Buffer.from(await download.arrayBuffer()).equals(content));

    // El contador de descargas se actualiza.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const metadata = await (await fetch(`${server.baseUrl}/api/documents/${document.id}`)).json();
    assert.equal(metadata.document.downloads, 1);

    // QR del documento.
    const qr = await fetch(`${server.baseUrl}${document.qrUrl}?size=256&download=1`);
    assert.equal(qr.status, 200);
    assert.equal(qr.headers.get('content-type'), 'image/png');
    assert.match(qr.headers.get('content-disposition'), /qr-Informe/);

    // Eliminar sin token / con token incorrecto / con token correcto.
    const noToken = await fetch(`${server.baseUrl}/api/documents/${document.id}`, { method: 'DELETE' });
    assert.equal(noToken.status, 401);
    const wrongToken = await fetch(`${server.baseUrl}/api/documents/${document.id}`, { method: 'DELETE', headers: { 'X-Delete-Token': 'falso' } });
    assert.equal(wrongToken.status, 403);
    const deleted = await fetch(`${server.baseUrl}/api/documents/${document.id}`, { method: 'DELETE', headers: { 'X-Delete-Token': body.deleteToken } });
    assert.equal(deleted.status, 204);

    const gone = await fetch(document.shareUrl);
    assert.equal(gone.status, 404);
    assert.match(await gone.text(), /Documento no encontrado/);
  });

  test('acepta formatos clásicos, PDF y texto', async () => {
    for (const [buffer, name] of [
      [sampleFile('ole2'), 'presupuesto.xls'],
      [sampleFile('ole2'), 'presentacion.ppt'],
      [sampleFile('pdf'), 'manual.pdf'],
      [sampleFile('accdb'), 'clientes.accdb'],
      [Buffer.from('id;nombre\n1;Ana\n'), 'datos.csv'],
    ]) {
      const { response, body } = await uploadFile(server.baseUrl, buffer, name);
      assert.equal(response.status, 201, `${name}: ${JSON.stringify(body)}`);
    }
  });

  test('rechaza archivos no admitidos o con contenido falso', async () => {
    const exe = await uploadFile(server.baseUrl, sampleFile('exe'), 'virus.exe');
    assert.equal(exe.response.status, 415);
    assert.equal(exe.body.error.code, 'UNSUPPORTED_FORMAT');

    const fake = await uploadFile(server.baseUrl, sampleFile('exe'), 'factura.docx');
    assert.equal(fake.response.status, 415);
    assert.equal(fake.body.error.code, 'SIGNATURE_MISMATCH');

    const empty = await uploadFile(server.baseUrl, Buffer.alloc(0), 'vacio.docx');
    assert.equal(empty.response.status, 400);
    assert.equal(empty.body.error.code, 'EMPTY_FILE');
  });

  test('POST /api/qr genera QR de enlaces y valida la entrada', async () => {
    const ok = await fetch(`${server.baseUrl}/api/qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'https://contoso.sharepoint.com/:w:/g/abc', format: 'svg' }),
    });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /image\/svg\+xml/);

    const missing = await fetch(`${server.baseUrl}/api/qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'png' }),
    });
    assert.equal(missing.status, 400);

    const badJson = await fetch(`${server.baseUrl}/api/qr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(badJson.status, 400);
    assert.equal((await badJson.json()).error.code, 'INVALID_JSON');
  });

  test('rutas inexistentes devuelven 404 en JSON o HTML', async () => {
    const apiMissing = await fetch(`${server.baseUrl}/api/no-existe`);
    assert.equal(apiMissing.status, 404);
    assert.equal((await apiMissing.json()).error.code, 'NOT_FOUND');

    const pageMissing = await fetch(`${server.baseUrl}/d/AAAAAAAAAAAA`);
    assert.equal(pageMissing.status, 404);
    assert.match(pageMissing.headers.get('content-type'), /text\/html/);
  });
});

describe('Límites y caducidad', () => {
  test('rechaza archivos que superan el tamaño máximo con 413', async () => {
    const server = await startTestServer({ maxFileSizeBytes: 1024 });
    try {
      const { response, body } = await uploadFile(server.baseUrl, sampleFile('zip', 4096), 'grande.pptx');
      assert.equal(response.status, 413);
      assert.equal(body.error.code, 'FILE_TOO_LARGE');
    } finally {
      await server.close();
    }
  });

  test('los documentos caducados devuelven 410 y se purgan', async () => {
    let clock = Date.now();
    const server = await startTestServer({ fileTtlHours: 1 }, { now: () => clock });
    try {
      const { body } = await uploadFile(server.baseUrl, sampleFile('zip'), 'hoja.xlsx');
      assert.ok(body.document.expiresAt);

      clock += 2 * 60 * 60 * 1000; // Dos horas después.
      const expired = await fetch(body.document.shareUrl);
      assert.equal(expired.status, 410);
      assert.match(await expired.text(), /Enlace caducado/);

      assert.equal(await server.store.purgeExpired(), 1);
      assert.equal(server.store.size, 0);
    } finally {
      await server.close();
    }
  });

  test('ofrece Office para la Web cuando la URL base es pública', async () => {
    const server = await startTestServer({ publicBaseUrl: 'https://qr.ejemplo.com' });
    try {
      const { body } = await uploadFile(server.baseUrl, sampleFile('zip'), 'propuesta.pptx');
      assert.equal(body.document.shareUrl, `https://qr.ejemplo.com/d/${body.document.id}`);
      const html = await (await fetch(`${server.baseUrl}/d/${body.document.id}`)).text();
      assert.match(html, /view\.officeapps\.live\.com/);
    } finally {
      await server.close();
    }
  });
});
