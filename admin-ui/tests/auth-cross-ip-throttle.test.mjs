import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountThrottleKey } from '../functions/api/workflow-core.js';

test('HMAC login throttle is stable across IPs, case and whitespace, secret-scoped',()=>{
  const key1=accountThrottleKey('  TEST@EXAMPLE.INVALID  ','private-secret-a');
  const key2=accountThrottleKey('test@example.invalid','private-secret-a');
  const rotated=accountThrottleKey('test@example.invalid','private-secret-b');
  assert.equal(key1,key2);
  assert.notEqual(key1,rotated);
  assert.match(key1,/^[0-9a-f]{64}$/);
  assert.ok(!key1.includes('test@example.invalid'));
  assert.throws(()=>accountThrottleKey('','secret'),/throttle key/);
  assert.throws(()=>accountThrottleKey('test@example.invalid',''),/throttle key/);
});

test('login atomically increments per-account counter BEFORE credential verification',()=>{
  const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const start=source.indexOf("app.post('/api/auth/login',async c=>{");
  const end=source.indexOf("app.post('/api/auth/refresh',async c=>{",start);
  assert.ok(start>=0&&end>start);
  const route=source.slice(start,end);
  assert.match(route,/accountThrottleKey\(d.email,c.env.JWT_ACCESS_SECRET\)/);
  assert.match(route,/INSERT INTO auth_attempts\(key_hash,attempts,window_started_at,updated_at\)/);
  assert.match(route,/ON CONFLICT\(key_hash\) DO UPDATE/);
  assert.match(route,/RETURNING attempts/);
  assert.match(route,/attempt.attempts>6/);
  assert.match(route,/await q\(c,'DELETE FROM auth_attempts WHERE key_hash=\$1',\[attemptKey\]\)/);
  assert.ok(route.indexOf('ON CONFLICT(key_hash) DO UPDATE')<route.indexOf('passVerify('));
  assert.doesNotMatch(route,/auth-account:'\+.*cf-connecting-ip/);
  assert.match(source,/if\(error.status===429\)c.header\('Retry-After','900'\)/);
});

test('refresh remains protected by separate IP rate limit before token parsing',()=>{
  const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  assert.match(source,/app.use\('\/api\/auth\/\*'/);
  assert.match(source,/if\(row.attempts>30\)fail\(429/);
  assert.match(source,/if\(!\['\/api\/auth\/login','\/api\/auth\/refresh'\]/);
});
