import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFinalization, checkApprovalState, validateDefectEdit } from '../admin-ui/functions/api/workflow-core.js';

const plan = [
  { no: 'A1', kategori: 'A', kebutuhan: 'Login works', urutan: 1 },
  { no: 'A2', kategori: 'A', kebutuhan: 'Export works', urutan: 2 },
];
const item = (no, status, hasil) => ({ ...plan.find(x => x.no === no), status, hasil });
const cases = (status = 'FAIL') => [item('A1', 'PASS', 'OK'), item('A2', status, status === 'PASS' ? 'Retest OK' : 'Export broken')];
const defect = (status, extras = {}) => ({ item_no: 'A2', status, resolution_note: null, last_retest: null, ...extras });

test('P0.04: FAIL without a defect must not finalize', () => {
  const result = checkFinalization(cases(), plan, { defects: [] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /FAIL.*waiver/i);
});

test('P0.04: unresolved and fixed-but-unverified defects block finalization', () => {
  for (const state of ['OPEN', 'IN_PROGRESS', 'FIXED', 'REOPENED']) {
    assert.equal(checkFinalization(cases(), plan, { defects: [defect(state)] }).ok, false, state);
  }
});

test('P0.04: waiver requires authorized role and written reason', () => {
  assert.throws(() => validateDefectEdit('OPEN', 'TESTER', { status: 'WAIVED', resolution_note: 'Risk accepted' }), /APPROVER/);
  assert.throws(() => validateDefectEdit('OPEN', 'APPROVER', { status: 'WAIVED', resolution_note: '  ' }), /alasan/);
  assert.deepEqual(validateDefectEdit('OPEN', 'APPROVER', { status: 'WAIVED', resolution_note: 'Accepted risk' }), ['status', 'resolution_note']);
  assert.equal(checkFinalization(cases(), plan, { defects: [defect('WAIVED')] }).ok, false);
  assert.equal(checkFinalization(cases(), plan, { defects: [defect('WAIVED', { resolution_note: 'Approved exception' })] }).ok, true);
});

test('P0.04: waived failure remains FAIL in official result', () => {
  const result = checkFinalization(cases('PASS'), plan, { defects: [defect('WAIVED', { resolution_note: 'Approved exception' })] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /tetap tercatat sebagai FAIL/);
});

test('P0.04: verified defect requires latest PASS retest and PASS item', () => {
  assert.equal(checkFinalization(cases(), plan, { defects: [defect('VERIFIED', { last_retest: 'PASS' })] }).ok, false);
  assert.equal(checkFinalization(cases('PASS'), plan, { defects: [defect('VERIFIED', { last_retest: 'FAIL' })] }).ok, false);
  assert.equal(checkFinalization(cases('PASS'), plan, { defects: [defect('VERIFIED', { last_retest: 'PASS' })] }).ok, true);
});

test('P0.04: duplicate or detached defect ledger entries are rejected', () => {
  assert.equal(checkFinalization(cases(), plan, { defects: [defect('WAIVED', { resolution_note: 'Approved' }), defect('WAIVED', { resolution_note: 'Approved' })] }).ok, false);
  assert.equal(checkFinalization(cases(), plan, { defects: [{ ...defect('WAIVED'), item_no: 'OTHER' }] }).ok, false);
});

test('P0.04: mandatory gate remains blocking even when defect is waived', () => {
  const gatePlan = [{ no: 'X1', kategori: 'X', kebutuhan: 'Critical gate', urutan: 1 }];
  const gateCases = [{ ...gatePlan[0], status: 'FAIL', hasil: 'Critical gate failed' }];
  const result = checkFinalization(gateCases, gatePlan, { requireGateX: true, defects: [{ item_no: 'X1', status: 'WAIVED', resolution_note: 'Accepted' }] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Gate wajib/);
});

test('P0.04: approval rechecks finalized session, not just prior finalization', () => {
  const options = { defects: [defect('WAIVED', { resolution_note: 'Accepted' })] };
  assert.equal(checkApprovalState({ status: 'FINAL', finalized_at: null, revision: 2 }, cases(), plan, options).ok, false);
  assert.equal(checkApprovalState({ status: 'FINAL', finalized_at: '2026-11-22T00:00:00Z', revision: 2 }, cases(), plan, options).ok, true);
  assert.equal(checkApprovalState({ status: 'FINAL', finalized_at: '2026-11-22T00:00:00Z', revision: 2 }, cases(), plan, { defects: [defect('OPEN')] }).ok, false);
});
