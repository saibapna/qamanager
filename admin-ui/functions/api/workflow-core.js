import { randomBytes, pbkdf2Sync, createHash, createHmac } from 'node:crypto';

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
  const byNo=new Map(items.map(x=>[String(x.no),x]));
  const defectsByNo=new Map();
  // Validate the entire defect ledger; filtering by current item status alone
  // would allow FAIL -> BELUM -> PASS to conceal an unresolved historical defect.
  for(const defect of defects){
    const key=String(defect.item_no);
    const item=byNo.get(key);
    if(!item)return {ok:false,reason:'Defect '+key+' tidak terhubung ke test case sesi'};
    if(defectsByNo.has(key))return {ok:false,reason:'Defect duplikat untuk test case '+key};
    defectsByNo.set(key,defect);
    if(!['VERIFIED','WAIVED'].includes(defect.status)){
      return {ok:false,reason:'Defect '+key+' belum selesai ('+String(defect.status||'UNKNOWN')+')'};
    }
    if(defect.status==='WAIVED'){
      if(!String(defect.resolution_note||'').trim())return {ok:false,reason:'Waiver defect '+key+' membutuhkan alasan tertulis'};
      if(item.status!=='FAIL')return {ok:false,reason:'Waiver '+key+' harus tetap tercatat sebagai FAIL'};
    }
    if(defect.status==='VERIFIED'){
      if(defect.last_retest!=='PASS')return {ok:false,reason:'Defect '+key+' membutuhkan retest PASS'};
      if(item.status!=='PASS')return {ok:false,reason:'Retest terverifikasi '+key+' harus menghasilkan status PASS'};
    }
  }
  for(const item of items.filter(x=>x.status==='FAIL')){
    if(defectsByNo.get(String(item.no))?.status!=='WAIVED'){
      return {ok:false,reason:'FAIL '+item.no+' wajib memiliki waiver yang disetujui atau retest PASS yang mengubah status item menjadi PASS'};
    }
  }
  return {ok:true};
}

/**
 * Bulk UAT editing must not rewrite a failure/retest history. The dedicated
 * defect/retest workflow is the only route allowed to clear a failed item.
 * A new FAIL after a verified PASS is permitted and reopens its defect.
 */
export function assertBulkItemTransition(previous, proposed, defect) {
  if (!previous || !proposed) throw new Error('Test case tidak valid');
  const changed = previous.status!==proposed.status ||
    String(previous.hasil||'')!==String(proposed.hasil||'');
  if (!changed) return;
  if (previous.status==='FAIL') {
    throw new Error('Hasil FAIL hanya dapat diubah melalui proses retest defect');
  }
  if (defect && proposed.status!=='FAIL') {
    throw new Error('Test case memiliki histori defect; hasil retest hanya dapat diubah melalui workflow defect');
  }
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

/** An old or altered FINAL session must never be signed without a fresh validation. */
export function checkApprovalState(session, items, catalog, options = {}) {
  if (session?.status !== 'FINAL') return {ok:false,reason:'Sesi harus FINAL'};
  if (!session.finalized_at) return {ok:false,reason:'Sesi FINAL lama belum diverifikasi'};
  if (!Number.isSafeInteger(Number(session.revision)) || Number(session.revision) < 1) {
    return {ok:false,reason:'Revisi approval tidak valid'};
  }
  return checkFinalization(items, catalog, options);
}

/** Pure authorization and state-machine validation for defect mutations. */
export function validateDefectEdit(previousStatus, memberRole, changes) {
  const transitions = {
    OPEN: ['IN_PROGRESS', 'WAIVED'],
    IN_PROGRESS: ['FIXED', 'WAIVED'],
    FIXED: ['REOPENED', 'WAIVED'],
    REOPENED: ['IN_PROGRESS', 'WAIVED'],
    VERIFIED: ['REOPENED'],
    WAIVED: [],
  };
  if (!Object.hasOwn(transitions, previousStatus)) throw new Error('Status defect tidak dikenali');
  if (previousStatus === 'WAIVED') throw new Error('Waiver yang disetujui tidak dapat diubah');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Perubahan defect tidak valid');
  if (changes.status !== undefined) {
    if (!transitions[previousStatus].includes(changes.status)) throw new Error('Transisi defect tidak valid');
    if (changes.status === 'WAIVED') {
      if (memberRole !== 'APPROVER') throw new Error('Hanya APPROVER dapat waiver');
      if (typeof changes.resolution_note !== 'string' ||
          !changes.resolution_note.trim() ||
          changes.resolution_note.length > 5000) throw new Error('Waiver perlu alasan tertulis');
    }
  }
  if (changes.severity !== undefined && !['LOW','MEDIUM','HIGH','CRITICAL'].includes(changes.severity)) throw new Error('Severity invalid');
  if (changes.title !== undefined && (typeof changes.title !== 'string' || !changes.title.trim() || changes.title.length > 255)) throw new Error('Judul defect tidak valid');
  for (const field of ['description','resolution_note']) {
    if (changes[field] !== undefined && changes[field] !== null &&
        (typeof changes[field] !== 'string' || changes[field].length > 5000)) {
      throw new Error(field === 'description' ? 'Deskripsi defect tidak valid' : 'Alasan defect tidak valid');
    }
  }
  const fields = ['severity','status','description','title','owner_id','resolution_note'].filter(k => changes[k] !== undefined);
  if (!fields.length) throw new Error('Tidak ada perubahan');
  return fields;
}


/**
 * Affected mutations and their audit records commit or roll back as one unit.
 * Each incoming Worker request owns one dedicated PostgreSQL client.
 * Never call inside a transaction already opened by the route.
 */
export async function runAtomic(query, work) {
  await query('BEGIN');
  try {
    const result = await work();
    await query('COMMIT');
    return result;
  } catch (error) {
    try { await query('ROLLBACK'); } catch { /* preserve the original failure */ }
    throw error;
  }
}


/**
 * Cross-IP account throttle key: deterministic per account, but keyed so a
 * database breach does not reveal unhashed email addresses by guessing SHA256.
 * Keep the key in a server-only Worker secret; never use user-editable claims.
 */
export function accountThrottleKey(email, secret) {
  if (typeof email !== 'string' || !email.trim() || typeof secret !== 'string' || !secret) {
    throw new Error('Cannot compute authentication throttle key');
  }
  return createHmac('sha256', secret)
    .update('qamanager:login:' + email.trim().toLowerCase())
    .digest('hex');
}
