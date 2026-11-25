import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getExtension, matchesSignature, validateOfficeFile } from '../src/services/fileValidator.js';
import { FORMATS, SIGNATURES, getPublicCatalog } from '../src/constants/officeFormats.js';
import { HttpError } from '../src/utils/httpError.js';
import { sampleFile } from './helpers.js';

async function withTempFile(buffer, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qr-office-validator-'));
  const filePath = path.join(dir, 'archivo.part');
  await fs.writeFile(filePath, buffer);
  try {
    return await run(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('getExtension normaliza a minúsculas y sin punto', () => {
  assert.equal(getExtension('Informe Final.DOCX'), 'docx');
  assert.equal(getExtension('archivo.tar.xlsx'), 'xlsx');
  assert.equal(getExtension('.bashrc'), '');
  assert.equal(getExtension('sin_extension'), '');
});

test('todas las extensiones del catálogo tienen una firma conocida', () => {
  const known = new Set(Object.values(SIGNATURES));
  for (const [extension, format] of Object.entries(FORMATS)) {
    assert.ok(known.has(format.signature), `.${extension} usa una firma desconocida`);
  }
  const { categories, accept } = getPublicCatalog();
  assert.ok(accept.includes('.docx') && accept.includes('.pptx') && accept.includes('.xlsx'));
  assert.equal(categories.reduce((total, category) => total + category.extensions.length, 0), Object.keys(FORMATS).length);
});

test('matchesSignature reconoce cada familia binaria', () => {
  assert.ok(matchesSignature(SIGNATURES.ZIP, sampleFile('zip')));
  assert.ok(matchesSignature(SIGNATURES.OLE2, sampleFile('ole2')));
  assert.ok(matchesSignature(SIGNATURES.PDF, sampleFile('pdf')));
  assert.ok(matchesSignature(SIGNATURES.RTF, sampleFile('rtf')));
  assert.ok(matchesSignature(SIGNATURES.JET, sampleFile('accdb')));
  assert.ok(matchesSignature(SIGNATURES.ONENOTE, sampleFile('onenote')));
  assert.ok(matchesSignature(SIGNATURES.TEXT, Buffer.from('nombre;edad\nAna;30\n')));
  // UTF-16 con BOM (así exporta Excel el "texto Unicode").
  assert.ok(matchesSignature(SIGNATURES.TEXT, Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00])));
});

test('matchesSignature rechaza contenidos que no corresponden', () => {
  assert.equal(matchesSignature(SIGNATURES.ZIP, sampleFile('exe')), false);
  assert.equal(matchesSignature(SIGNATURES.OLE2, sampleFile('zip')), false);
  assert.equal(matchesSignature(SIGNATURES.PDF, sampleFile('ole2')), false);
  assert.equal(matchesSignature(SIGNATURES.TEXT, sampleFile('exe')), false);
});

test('validateOfficeFile acepta un .docx con firma ZIP', async () => {
  await withTempFile(sampleFile('zip'), async (filePath) => {
    const { extension, format } = await validateOfficeFile(filePath, 'Contrato.docx');
    assert.equal(extension, 'docx');
    assert.equal(format.category, 'word');
  });
});

test('validateOfficeFile rechaza formatos no admitidos con 415', async () => {
  await withTempFile(sampleFile('exe'), async (filePath) => {
    await assert.rejects(validateOfficeFile(filePath, 'programa.exe'), (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 415);
      assert.equal(error.code, 'UNSUPPORTED_FORMAT');
      return true;
    });
  });
});

test('validateOfficeFile rechaza un ejecutable renombrado a .xlsx', async () => {
  await withTempFile(sampleFile('exe'), async (filePath) => {
    await assert.rejects(validateOfficeFile(filePath, 'nominas.xlsx'), { status: 415, code: 'SIGNATURE_MISMATCH' });
  });
});
