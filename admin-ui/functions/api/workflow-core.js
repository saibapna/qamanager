import { randomBytes, pbkdf2Sync, createHash } from 'node:crypto';

// These invariants are shared by the API routes and executable regression tests.
export const UAT_STATUSES = Object.freeze(['PASS','FAIL','BELUM']);
export const PROJECT_ROLES = Object.freeze(['ADMIN','TESTER','WITNESS','APPROVER','AUDITOR']);

export function assertCanonicalItems(input, catalog) {
  if (!Array.isArray(input) || !Array.isArray(catalog) || !catalog.length || input.length !== catalog.length) {
    throw new Error('Jumlah item tidak sesuai test plan kanonis');
  }
  const canonical = new Map(catalog.map(x => [String(x.no), x]));
  const seen = new Set();
  for (const it of input) {
    const plan = canonical.get(String(it?.no));
    if (!plan || seen.has(String(it.no)) || !UAT_STATUSES.includes(it.status) ||
        String(it.kategori) !== String(plan.kategori) ||
        String(it.kebutuhan) !== String(plan.kebutuhan) ||
        Number(it.urutan) !== Number(plan.urutan)) {
      throw new Error('Test case berbeda dari test plan kanonis, duplikat, atau status invalid');
    }
    if (it.hasil !== null && it.hasil !== undefined && typeof it.hasil !== 'string') {
      throw new Error('Hasil pengujian harus teks');
    }
    if (it.status !== 'BELUM' && !String(it.hasil || '').trim()) {
      throw new Error('Hasil wajib diisi untuk test case PASS atau FAIL');
    }
    seen.add(String(it.no));
  }
}

export function checkFinalization(items, catalog, options = {}) {
  try { assertCanonicalItems(items, catalog); }
  catch (e) { return { ok: false, reason: e.message }; }
  if (items.some(x => x.status === 'BELUM')) {
    return {ok:false,reason:'Semua test case wajib diuji sebelum finalisasi'};
  }
  if (options.requireGateX) {
    const gates=['X1','X2','X3','X4','X5'];
    if (gates.some(no => items.find(i => i.no === no)?.status !== 'PASS')) {
      return {ok:false,reason:'Gate wajib X1–X5 harus lengkap dan berstatus PASS'};
    }
  }
  const defects=options.defects || [];
  for (const item of items.filter(i=>i.status==='FAIL')) {
    const defect = defects.find(d => String(d.item_no)===String(item.no));
    if (!defect || !['VERIFIED','WAIVED'].includes(defect.status)) {
      return {ok:false,reason:'FAIL '+item.no+' harus memiliki defect terverifikasi atau waiver disetujui'};
    }
    if (defect.status==='WAIVED' && !String(defect.resolution_note||'').trim()) {
      return {ok:false,reason:'Waiver defect '+item.no+' membutuhkan alasan tertulis'};
    }
    if (defect.status==='VERIFIED' && defect.last_retest !== 'PASS') {
      return {ok:false,reason:'Defect '+item.no+' membutuhkan retest PASS'};
    }
  }
  return {ok:true};
}

export function hashCloudflarePassword(password) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 128) {
    throw new Error('Password harus 16–128 karakter');
  }
  const salt = randomBytes(24);
  const digest = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return 'pbkdf2_sha256$100000$'+salt.toString('base64url')+'$'+digest.toString('base64url');
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function assertPositiveId(x) {
  const v=Number(x);
  if(!Number.isSafeInteger(v)||v<=0)throw new Error('ID tidak valid');
  return v;
}
