import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/ProjectsPage.tsx', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../../.github/tests/production-browser.spec.mjs', import.meta.url), 'utf8');

test('project loading and empty cell text meet WCAG 2.1 AA foreground contrast', () => {
  const cases = ['Memuat...', 'Belum ada project'];
  for (const label of cases) {
    const line = source.split('\n').find(text => text.includes(label));
    assert.ok(line, 'missing status '+label);
    assert.match(line, /text-center text-slate-600/);
    assert.doesNotMatch(line, /text-slate-400/);
  }
});

test('browser keeps WCAG contrast regression under the automated AA gate', () => {
  assert.match(browser, /WCAG 2\.1 AA: authenticated-looking project dashboard/);
  assert.match(browser, /withTags\(\['wcag2a','wcag2aa','wcag21a','wcag21aa'\]\)/);
  assert.match(browser, /expect\(errors, 'WCAG 2\.1 AA violations on '/);
});
