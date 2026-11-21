import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=path=>readFileSync(new URL(path, import.meta.url),'utf8');
const field=source('../src/components/FormField.tsx');
const browser=source('../../.github/tests/production-browser.spec.mjs');
const workflow=source('../../.github/workflows/production-browser-smoke.yml');

test('all reusable form field labels wrap their associated input/control',()=>{
  assert.match(field,/<label className="block">/);
  assert.match(field,/\{children\}\s*<\/label>/);
  assert.match(field,/role="alert"/);
  assert.doesNotMatch(field,/<label className="block[^"]*">\s*\{label\}[^<]*<\/label>\s*\{children\}/);
});

test('the deployed Chromium suite enforces WCAG 2.1 AA without suppressing violations',()=>{
  assert.match(workflow,/@axe-core\/playwright@4\.14\.0/);
  assert.match(browser,/withTags\(\['wcag2a','wcag2aa','wcag21a','wcag21aa'\]\)/);
  assert.match(browser,/expect\(errors, 'WCAG 2.1 AA violations on '/);
  assert.match(browser,/WCAG 2\.1 AA: production unauthenticated login/);
  assert.match(browser,/WCAG 2\.1 AA: mobile login/);
  assert.match(browser,/WCAG 2\.1 AA: authenticated-looking project dashboard/);
  assert.match(browser,/synthetic@example.invalid/);
});
