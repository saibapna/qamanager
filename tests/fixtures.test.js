import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'lampiran.pdf');

let exists = true;
try { await fs.access(FIXTURE); } catch { exists = false; }

test('fixture baseline tersedia', { skip: !exists }, async () => {
  const buf = await fs.readFile(FIXTURE);
  const doc = await PDFDocument.load(buf);
  assert.equal(doc.getPageCount(), 5);
});
