import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../../.github/workflows/production-api-smoke.yml',import.meta.url),'utf8');

test('continuous production smoke runs on main and every 30 minutes',()=>{
  assert.match(workflow,/branches: \[main\]/);
  assert.match(workflow,/cron: '\*\/30 \* \* \* \*'/);
  assert.match(workflow,/test "\$health" = "200"/);
  assert.match(workflow,/test "\$unauth" = "401"/);
});

test('failed smoke creates or updates one GitHub incident and green smoke closes it',()=>{
  assert.match(workflow,/issues: write/);
  assert.match(workflow,/group: qamanager-production-api-smoke/);
  assert.match(workflow,/if: failure\(\)/);
  assert.match(workflow,/if: success\(\)/);
  assert.match(workflow,/gh issue list --repo/);
  assert.match(workflow,/gh issue comment/);
  assert.match(workflow,/gh issue create/);
  assert.match(workflow,/gh issue close/);
  assert.match(workflow,/GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN/);
});
