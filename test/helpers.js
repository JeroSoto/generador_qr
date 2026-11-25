/**
 * Utilidades compartidas por las pruebas: arranque de la app en un puerto
 * aleatorio con almacenamiento temporal y generación de archivos de ejemplo.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

/** Cabeceras binarias mínimas para cada familia de firma. */
export const SAMPLE_HEADERS = {
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]),
  ole2: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  pdf: Buffer.from('%PDF-1.7\n', 'latin1'),
  rtf: Buffer.from('{\\rtf1\\ansi Hola}', 'latin1'),
  accdb: Buffer.concat([Buffer.from([0x00, 0x01, 0x00, 0x00]), Buffer.from('Standard ACE DB', 'latin1')]),
  onenote: Buffer.from([0xe4, 0x52, 0x5c, 0x7b, 0x8c, 0xd8, 0xa7, 0x4d, 0xae, 0xb1, 0x53, 0x78, 0xd0, 0x29, 0x96, 0xd3]),
  exe: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
};

/** Crea un archivo de ejemplo: cabecera + relleno para que tenga cierto tamaño. */
export function sampleFile(kind, paddingBytes = 2048) {
  return Buffer.concat([SAMPLE_HEADERS[kind], Buffer.alloc(paddingBytes, 0x41)]);
}

/**
 * Arranca la aplicación aislada.
 * @param {object} [overrides] Opciones de configuración.
 * @param {object} [appOptions] Opciones de createApp (p. ej. reloj `now`).
 */
export async function startTestServer(overrides = {}, appOptions = {}) {
  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qr-office-test-'));
  const config = loadConfig({ storageDir, logRequests: false, ...overrides }, {});
  const { app, store } = await createApp(config, appOptions);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    store,
    config,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(storageDir, { recursive: true, force: true });
    },
  };
}

/** Sube un archivo a la API y devuelve la respuesta y su JSON. */
export async function uploadFile(baseUrl, buffer, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  const response = await fetch(`${baseUrl}/api/documents`, { method: 'POST', body: form });
  const body = await response.json();
  return { response, body };
}
