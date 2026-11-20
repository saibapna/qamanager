import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { hashCloudflarePassword } from '../admin-ui/functions/api/workflow-core.js';

test('Express and Hono provisioning create interoperable Cloudflare-compatible password hashes', async () => {
  const password='only-a-synthetic-unit-test-password-2026!';
  const hashes=[await hashPassword(password),hashCloudflarePassword(password)];
  assert.notEqual(hashes[0],hashes[1],'Salt must be unique for each hash');
  for (const hash of hashes) {
    const [algo,iterations,salt,digest,...extra] = hash.split('$');
    assert.equal(algo,'pbkdf2_sha256');
    assert.equal(iterations,'100000');
    assert.equal(extra.length,0);
    assert.ok(Buffer.from(salt,'base64url').byteLength>=16);
    assert.equal(Buffer.from(digest,'base64url').byteLength,32);
    assert.equal(await verifyPassword(hash,password),true);
    assert.equal(await verifyPassword(hash,password+'wrong'),false);
  }
});
