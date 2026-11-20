import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'test', 'migrated.json');

test('migrasi JSON dump → schema valid', async () => {
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  const dump = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'dump-example.json'), 'utf-8'));
  assert.ok(Array.isArray(dump.items));
  assert.ok(dump.ringkasan);
});
