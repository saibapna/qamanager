import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDefectEdit } from '../functions/api/workflow-core.js';

test('only approver may waive a defect with a written justification', () => {
  assert.throws(() => validateDefectEdit('OPEN','TESTER',{status:'WAIVED',resolution_note:'accepted'}), /Hanya APPROVER/);
  assert.throws(() => validateDefectEdit('OPEN','APPROVER',{status:'WAIVED',resolution_note:'   '}), /alasan tertulis/);
  assert.deepEqual(validateDefectEdit('OPEN','APPROVER',{status:'WAIVED',resolution_note:'Risk approved'}), ['status','resolution_note']);
});

test('waivers remain immutable, even when caller omits status', () => {
  assert.throws(() => validateDefectEdit('WAIVED','APPROVER',{resolution_note:'overwrite'}), /tidak dapat diubah/);
  assert.throws(() => validateDefectEdit('WAIVED','ADMIN',{severity:'LOW'}), /tidak dapat diubah/);
});

test('defect status transitions are explicit and prohibit verification shortcut', () => {
  assert.throws(() => validateDefectEdit('OPEN','ADMIN',{status:'VERIFIED'}), /Transisi/);
  assert.throws(() => validateDefectEdit('FIXED','TESTER',{status:'VERIFIED'}), /Transisi/);
  assert.deepEqual(validateDefectEdit('IN_PROGRESS','TESTER',{status:'FIXED'}), ['status']);
});

test('reject unknown fields, invalid severity and malformed inputs', () => {
  assert.throws(() => validateDefectEdit('OPEN','TESTER',{}), /Tidak ada perubahan/);
  assert.throws(() => validateDefectEdit('OPEN','TESTER',{severity:'BLOCKER'}), /Severity/);
  assert.throws(() => validateDefectEdit('OPEN','TESTER',{title:' '}), /Judul/);
  assert.throws(() => validateDefectEdit('OPEN','TESTER',{owner_id:1,description:'x'.repeat(5001)}), /Deskripsi/);
  assert.throws(() => validateDefectEdit('UNKNOWN','TESTER',{status:'FIXED'}), /tidak dikenali/);
});
