
import {createHash} from 'node:crypto';
import {hashCloudflarePassword,PROJECT_ROLES,checkApprovalState,validateDefectEdit,runAtomic} from './workflow-core.js';
import { PRIVATE_STORAGE_LIMITS, wouldExceedQuota, storageMiB } from './storage-policy.js';
import {storeFile,readFile,cleanupUncommitted,storageEnabled} from './private-storage.js';

const good=(v,max=255)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const optional=v=>typeof v==='string'?v.trim():null;
const dataBytes=v=>v instanceof Uint8Array?v:typeof v==='string'&&v.startsWith('\\x')?Buffer.from(v.slice(2),'hex'):null;
const fileDownload=(data,mime,name)=>{
  const bytes=dataBytes(data);
  if(!bytes)return null;
  return new Response(bytes,{headers:{
    'Content-Type':mime,'Content-Length':String(bytes.byteLength),
    'Content-Disposition':'attachment; filename="'+String(name).replace(/["\r\n\\]/g,'_')+'"',
    'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'
  }});
};
export function installWorkflowRoutes(app,{q,first,guard,id,fail,audit,json,publishLive}){
  const atomic=(c,work)=>runAtomic(sql=>q(c,sql),work);
  const role=async(c,pid)=>(await first(c,'SELECT role FROM project_members WHERE user_id=$1 AND project_id=$2',[c.get('uid'),pid]))?.role;
  const draft=async(c,sid)=>{
    const s=await first(c,'SELECT project_id,status,revision FROM ulo_sesi WHERE id=$1',[sid]);
    if(s?.status!=='DRAFT')fail(409,'Hanya sesi DRAFT dapat diubah');
    return s;
  };
  // Portfolio is always restricted to projects where this specific user is a current member.
  // LATERAL aggregates prevent joins from multiplying item and defect counts.
  app.get('/api/projects/:projectId/storage-usage',async c=>{
    const pid=await guard(c,'projectId',['ADMIN','AUDITOR']);
    const evidence=await first(c,'SELECT count(*)::int objects,coalesce(sum(byte_size),0)::bigint AS total_bytes FROM ulo_evidence WHERE project_id=$1',[pid]);
    const fixtures=await first(c,'SELECT count(*)::int objects,coalesce(sum(f.size_bytes),0)::bigint AS total_bytes FROM template_fixtures f JOIN templates t ON t.id=f.template_id WHERE t.project_id=$1',[pid]);
    const pdf=await first(c,'SELECT count(*)::int objects,coalesce(sum(o.size_bytes),0)::bigint AS total_bytes FROM ulo_output o JOIN ulo_sesi s ON s.id=o.sesi_id WHERE s.project_id=$1',[pid]);
    return c.json({
      evidence:{...evidence,limit_bytes:PRIVATE_STORAGE_LIMITS.evidenceProjectBytes},
      fixtures:{...fixtures,limit_bytes:PRIVATE_STORAGE_LIMITS.fixtureProjectBytes},
      pdf:{...pdf,limit_bytes:PRIVATE_STORAGE_LIMITS.pdfProjectBytes},
      note:'Bukti yang dihapus secara logis tetap dihitung dalam kuota, baik pada penyimpanan binary lama maupun object storage'
    });
  });

  app.get('/api/dashboard/portfolio',async c=>{
    const result=await q(c,`SELECT p.id,p.kode,p.nama,p.instansi,
        sessions.total_sessions,sessions.signed_sessions,
        items.total_items,items.pass_items,items.fail_items,items.pending_items,
        defects.open_defects,
        approvals.awaiting_witness,approvals.awaiting_approver,approvals.rejected_decisions
      FROM projects p JOIN project_members pm ON pm.project_id=p.id
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS total_sessions,
               count(*) FILTER (WHERE status='SIGNED')::int AS signed_sessions
        FROM ulo_sesi WHERE project_id=p.id
      ) sessions
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS total_items,
               count(*) FILTER (WHERE i.status='PASS')::int AS pass_items,
               count(*) FILTER (WHERE i.status='FAIL')::int AS fail_items,
               count(*) FILTER (WHERE i.status='BELUM')::int AS pending_items
        FROM ulo_item i JOIN ulo_sesi s ON s.id=i.sesi_id
        WHERE s.project_id=p.id
      ) items
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS open_defects FROM ulo_defects d
        WHERE d.project_id=p.id AND d.status NOT IN('VERIFIED','WAIVED')
      ) defects
      CROSS JOIN LATERAL (
        SELECT
          count(*) FILTER (
            WHERE s.status='FINAL' AND s.finalized_at IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM ulo_approvals a WHERE a.sesi_id=s.id AND a.revision=s.revision
                AND a.role='WITNESS' AND a.decision='APPROVED'
            )
          )::int AS awaiting_witness,
          count(*) FILTER (
            WHERE s.status='FINAL' AND s.finalized_at IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM ulo_approvals a WHERE a.sesi_id=s.id AND a.revision=s.revision
                AND a.role='WITNESS' AND a.decision='APPROVED'
            )
            AND NOT EXISTS (
              SELECT 1 FROM ulo_approvals a WHERE a.sesi_id=s.id AND a.revision=s.revision
                AND a.role='APPROVER'
            )
          )::int AS awaiting_approver,
          (SELECT count(*)::int FROM ulo_approvals a
           WHERE a.project_id=p.id AND a.decision='REJECTED') AS rejected_decisions
        FROM ulo_sesi s WHERE s.project_id=p.id
      ) approvals
      WHERE pm.user_id=$1 AND p.aktif=TRUE ORDER BY p.kode`,[c.get('uid')]);
    return c.json(result.rows);
  });
  app.get('/api/projects/:projectId/plan',async c=>{
    const pid=await guard(c,'projectId');
    return c.json((await q(c,'SELECT no,kategori,kebutuhan,urutan,gate_required FROM test_plan_items WHERE project_id=$1 ORDER BY urutan',[pid])).rows);
  });
  app.put('/api/projects/:projectId/plan',async c=>{
    const pid=await guard(c,'projectId',['ADMIN']),body=await json(c),items=body?.items;
    if(!Array.isArray(items)||items.length<1||items.length>1000)fail(422,'Test plan 1-1000 item wajib');
    const seen=new Set();
    for(let index=0;index<items.length;index++){
      const i=items[index];
      if(!good(i?.no,20)||!good(i?.kategori,5)||!good(i?.kebutuhan,5000)||i.urutan!==index+1||seen.has(i.no))fail(422,'Test plan tidak valid');
      seen.add(i.no);
    }
    await q(c,'BEGIN');
    try{
      // Lock the project even when it has zero sessions. Session creation takes the
      // same lock before reading the plan, avoiding a first-session race.
      await q(c,'SELECT id FROM projects WHERE id=$1 FOR UPDATE',[pid]);
      if(await first(c,'SELECT id FROM ulo_sesi WHERE project_id=$1 LIMIT 1',[pid]))fail(409,'Tidak boleh mengubah test plan setelah ada sesi');
      await q(c,'DELETE FROM test_plan_items WHERE project_id=$1',[pid]);
      for(const t of items)await q(c,'INSERT INTO test_plan_items(project_id,no,kategori,kebutuhan,urutan,gate_required) VALUES($1,$2,$3,$4,$5,$6)',[pid,t.no,t.kategori,t.kebutuhan,t.urutan,!!t.gate_required]);
      c.set('pid',pid);await audit(c,'TEST_PLAN_REPLACED','project',pid,{count:items.length});
      await q(c,'COMMIT');return c.json({ok:true,count:items.length});
    }catch(e){await q(c,'ROLLBACK');throw e;}
  });
  app.get('/api/projects/:projectId/members',async c=>{
    const pid=await guard(c,'projectId',['ADMIN','AUDITOR']);
    return c.json((await q(c,'SELECT u.id,u.email,u.nama,u.aktif,pm.role FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 ORDER BY pm.role,u.nama',[pid])).rows);
  });
  app.post('/api/projects/:projectId/members',async c=>{
    const pid=await guard(c,'projectId',['ADMIN']),d=await json(c);
    if(!good(d?.email)||!d.email.includes('@')||!good(d?.nama)||!PROJECT_ROLES.includes(d?.role))fail(422,'Nama email dan role wajib');
    await q(c,'BEGIN');
    try{
      let user=await first(c,'SELECT id,email FROM users WHERE lower(email)=lower($1)',[d.email.trim()]);
      if(!user){
        let hash;
        try{hash=hashCloudflarePassword(d.password);}catch(e){fail(422,e.message);}
        user=await first(c,'INSERT INTO users(email,nama,password_hash) VALUES($1,$2,$3) RETURNING id,email',[d.email.trim().toLowerCase(),d.nama.trim(),hash]);
      }
      await q(c,'SELECT id FROM projects WHERE id=$1 FOR UPDATE',[pid]);
      const existing=await first(c,'SELECT role FROM project_members WHERE user_id=$1 AND project_id=$2',[user.id,pid]);
      if(existing?.role==='ADMIN'&&d.role!=='ADMIN'){
        const admins=await first(c,"SELECT count(*)::int AS total FROM project_members WHERE project_id=$1 AND role='ADMIN'",[pid]);
        if(admins.total<=1)fail(409,'Tidak boleh menurunkan role ADMIN terakhir pada project');
        if(user.id===c.get('uid'))fail(409,'Tidak boleh menurunkan role admin diri sendiri');
      }
      await q(c,'INSERT INTO project_members(user_id,project_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,project_id) DO UPDATE SET role=excluded.role',[user.id,pid,d.role]);
      c.set('pid',pid);await audit(c,'PROJECT_MEMBER_SET','project_member',user.id,{role:d.role});
      await q(c,'COMMIT');return c.json({id:user.id,email:user.email,role:d.role},201);
    }catch(e){await q(c,'ROLLBACK');throw e;}
  });
  app.delete('/api/projects/:projectId/members/:userId',async c=>{
    const pid=await guard(c,'projectId',['ADMIN']),uid=id(c.req.param('userId'));
    if(uid===c.get('uid'))fail(409,'Tidak boleh mencabut akses diri sendiri');
    await q(c,'BEGIN');
    try{
      await q(c,'SELECT id FROM projects WHERE id=$1 FOR UPDATE',[pid]);
      const target=await first(c,'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2 FOR UPDATE',[pid,uid]);
      if(!target)fail(404,'Anggota tidak ditemukan');
      if(target.role==='ADMIN'){
        const n=await first(c,"SELECT count(*)::int n FROM project_members WHERE project_id=$1 AND role='ADMIN'",[pid]);
        if(n.n<=1)fail(409,'Setiap project wajib memiliki ADMIN');
      }
      await q(c,'DELETE FROM project_members WHERE project_id=$1 AND user_id=$2',[pid,uid]);
      c.set('pid',pid);await audit(c,'PROJECT_MEMBER_REMOVED','project_member',uid);
      await q(c,'COMMIT');
       if(publishLive)await publishLive(c,'PROJECT_MEMBER_REMOVED',undefined,undefined,uid);
       return c.body(null,204);
    }catch(e){await q(c,'ROLLBACK');throw e;}
  });
  app.get('/api/projects/:projectId/people',async c=>{
    const pid=await guard(c,'projectId');
    return c.json((await q(c,'SELECT id,kind,nama,jabatan,email,telepon,nip,aktif FROM project_people WHERE project_id=$1 ORDER BY aktif DESC,kind,nama',[pid])).rows);
  });
  app.post('/api/projects/:projectId/people',async c=>{
    const pid=await guard(c,'projectId',['ADMIN','TESTER']),d=await json(c);
    if(!['PENGUJI','SAKSI'].includes(d?.kind)||!good(d?.nama))fail(422,'Jenis dan nama wajib');
    return atomic(c,async()=>{
      const row=await first(c,'INSERT INTO project_people(project_id,kind,nama,jabatan,email,telepon,nip) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[pid,d.kind,d.nama.trim(),optional(d.jabatan),optional(d.email),optional(d.telepon),optional(d.nip)]);
      c.set('pid',pid);await audit(c,'PROJECT_PERSON_CREATED','project_person',row.id);
      return c.json(row,201);
    });
  });
  app.patch('/api/projects/:projectId/people/:personId',async c=>{
    const pid=await guard(c,'projectId',['ADMIN','TESTER']),who=id(c.req.param('personId')),d=await json(c);
    const keys=['kind','nama','jabatan','email','telepon','nip','aktif'].filter(k=>d?.[k]!==undefined);
    if(!keys.length||(d.kind!==undefined&&!['PENGUJI','SAKSI'].includes(d.kind))||(d.nama!==undefined&&!good(d.nama)))fail(422,'Perubahan tidak valid');
    return atomic(c,async()=>{
      const result=await first(c,'UPDATE project_people SET '+keys.map((k,i)=>k+'=$'+(i+1)).join(',')+' WHERE id=$'+(keys.length+1)+' AND project_id=$'+(keys.length+2)+' RETURNING *',[...keys.map(k=>d[k]),who,pid]);
      if(!result)fail(404,'Orang tidak ditemukan');
      c.set('pid',pid);await audit(c,'PROJECT_PERSON_UPDATED','project_person',who);
      return c.json(result);
    });
  });
  app.patch('/api/aplikasi/:aplikasiId',async c=>{
    const pid=await guard(c,'aplikasiId',['ADMIN','TESTER']),aid=id(c.req.param('aplikasiId')),d=await json(c);
    const keys=['nama_singkat','nama_panjang','url'].filter(k=>d?.[k]!==undefined);
    if(!keys.length||(d.nama_singkat!==undefined&&!good(d.nama_singkat,100)))fail(422,'Perubahan aplikasi invalid');
    return atomic(c,async()=>{
      const row=await first(c,'UPDATE aplikasi SET '+keys.map((k,i)=>k+'=$'+(i+1)).join(',')+' WHERE id=$'+(keys.length+1)+' AND project_id=$'+(keys.length+2)+' RETURNING *',[...keys.map(k=>d[k]),aid,pid]);
      if(!row)fail(404,'Aplikasi tidak ditemukan');
      c.set('pid',pid);await audit(c,'APLIKASI_UPDATED','aplikasi',aid);
      return c.json(row);
    });
  });
  app.delete('/api/aplikasi/:aplikasiId',async c=>{
    const pid=await guard(c,'aplikasiId',['ADMIN']),aid=id(c.req.param('aplikasiId'));
    return atomic(c,async()=>{
      const application=await first(c,'SELECT id FROM aplikasi WHERE id=$1 AND project_id=$2 FOR UPDATE',[aid,pid]);
      if(!application)fail(404,'Aplikasi tidak ditemukan');
      if(await first(c,'SELECT id FROM ulo_sesi WHERE aplikasi_id=$1 LIMIT 1',[aid]))fail(409,'Aplikasi memiliki sesi UAT');
      await q(c,'DELETE FROM aplikasi WHERE id=$1 AND project_id=$2',[aid,pid]);
      c.set('pid',pid);await audit(c,'APLIKASI_DELETED','aplikasi',aid);
      return c.body(null,204);
    });
  });
  app.get('/api/projects/:projectId/dashboard',async c=>{
    const pid=await guard(c,'projectId');
    const sessions=await first(c,"SELECT count(*)::int total,count(*) FILTER(WHERE status='DRAFT')::int drafts,count(*) FILTER(WHERE status='FINAL')::int finals,count(*) FILTER(WHERE status='SIGNED')::int signed FROM ulo_sesi WHERE project_id=$1",[pid]);
    const items=await first(c,"SELECT count(*)::int total,count(*) FILTER(WHERE i.status='PASS')::int pass,count(*) FILTER(WHERE i.status='FAIL')::int fail,count(*) FILTER(WHERE i.status='BELUM')::int belum FROM ulo_item i JOIN ulo_sesi s ON s.id=i.sesi_id WHERE s.project_id=$1",[pid]);
    const defects=await first(c,"SELECT count(*)::int total,count(*) FILTER(WHERE status NOT IN('VERIFIED','WAIVED'))::int unresolved FROM ulo_defects WHERE project_id=$1",[pid]);
    const approvals=await first(c,`SELECT count(*) FILTER (WHERE s.status='FINAL' AND s.finalized_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ulo_approvals a WHERE a.sesi_id=s.id AND a.revision=s.revision AND a.role='WITNESS' AND a.decision='APPROVED'))::int AS awaiting_witness,
      count(*) FILTER (WHERE s.status='FINAL' AND s.finalized_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM ulo_approvals a WHERE a.sesi_id=s.id AND a.revision=s.revision AND a.role='WITNESS' AND a.decision='APPROVED')
      AND NOT EXISTS (SELECT 1 FROM ulo_approvals a WHERE a.sesi_id=s.id AND a.revision=s.revision AND a.role='APPROVER'))::int AS awaiting_approver,
      (SELECT count(*)::int FROM ulo_approvals a WHERE a.project_id=$1 AND a.decision='REJECTED') AS rejected_decisions
      FROM ulo_sesi s WHERE s.project_id=$1`,[pid]);
    return c.json({sessions,items,defects,approvals});
  });
  app.get('/api/projects/:projectId/audit',async c=>{
    const pid=await guard(c,'projectId',['ADMIN','AUDITOR']);
    const offset=Math.max(0,Math.min(10000,Number(c.req.query('offset')||0)||0));
    return c.json((await q(c,'SELECT id,actor_id,action,entity_type,entity_id,metadata,occurred_at FROM audit_events WHERE project_id=$1 ORDER BY occurred_at DESC,id DESC LIMIT 100 OFFSET $2',[pid,offset])).rows);
  });
  app.get('/api/sesi/:sesiId/history',async c=>{
    await guard(c,'sesiId');const sid=id(c.req.param('sesiId'));
    return c.json((await q(c,'SELECT item_no,old_status,new_status,old_hasil,new_hasil,actor_id,occurred_at FROM ulo_item_events WHERE sesi_id=$1 ORDER BY occurred_at DESC,id DESC LIMIT 250',[sid])).rows);
  });
  app.get('/api/sesi/:sesiId/defects',async c=>{
    await guard(c,'sesiId');const sid=id(c.req.param('sesiId'));
    return c.json((await q(c,'SELECT d.*,i.no AS item_no FROM ulo_defects d JOIN ulo_item i ON i.id=d.item_id WHERE d.sesi_id=$1 ORDER BY d.id',[sid])).rows);
  });
  app.patch('/api/sesi/:sesiId/defects/:defectId',async c=>{
    const pid=await guard(c,'sesiId',['ADMIN','TESTER','APPROVER']),sid=id(c.req.param('sesiId')),did=id(c.req.param('defectId')),d=await json(c);
    // Serialize against finalization and concurrent defect edits. A failed mutation
    // must roll back both the defect change and its audit event.
    await q(c,'BEGIN');
    try{
      const session=await first(c,'SELECT status FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);
      if(session?.status!=='DRAFT')fail(409,'Hanya sesi DRAFT dapat diubah');
      const prev=await first(c,'SELECT status FROM ulo_defects WHERE sesi_id=$1 AND id=$2 FOR UPDATE',[sid,did]);
      if(!prev)fail(404,'Defect tidak ditemukan');
      if(prev.status==='WAIVED')fail(409,'Waiver yang disetujui tidak dapat diubah');
      let fields;
      try{fields=validateDefectEdit(prev.status,await role(c,pid),d);}
      catch(e){fail(e.message.includes('Hanya APPROVER')?403:e.message.includes('Transisi')||e.message.includes('Waiver yang')?409:422,e.message);}
      if(d.owner_id!==undefined&&d.owner_id!==null){
        const owner=id(d.owner_id);
        const member=await first(c,'SELECT 1 FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND pm.user_id=$2 AND u.aktif=TRUE',[pid,owner]);
        if(!member)fail(422,'Owner defect harus anggota aktif project');
      }
      const result=await first(c,'UPDATE ulo_defects SET '+fields.map((k,i)=>k+'=$'+(i+1)).join(',')+',updated_at=now() WHERE id=$'+(fields.length+1)+' AND sesi_id=$'+(fields.length+2)+' RETURNING *',[...fields.map(k=>d[k]),did,sid]);
      if(!result)fail(409,'Defect berubah secara bersamaan; muat ulang');
      c.set('pid',pid);await audit(c,'DEFECT_UPDATED','defect',did,{fields,previous_status:prev.status,new_status:result.status});
      await q(c,'COMMIT');
      return c.json(result);
    }catch(e){await q(c,'ROLLBACK');throw e;}
  });
  app.get('/api/sesi/:sesiId/defects/:defectId/retests',async c=>{
    await guard(c,'sesiId');const sid=id(c.req.param('sesiId')),did=id(c.req.param('defectId'));
    if(!await first(c,'SELECT id FROM ulo_defects WHERE sesi_id=$1 AND id=$2',[sid,did]))fail(404,'Defect tidak ditemukan');
    return c.json((await q(c,'SELECT id,status,note,actor_id,recorded_at FROM ulo_retests WHERE defect_id=$1 ORDER BY id DESC',[did])).rows);
  });
  app.post('/api/sesi/:sesiId/defects/:defectId/retests',async c=>{
    const pid=await guard(c,'sesiId',['ADMIN','TESTER']),sid=id(c.req.param('sesiId')),did=id(c.req.param('defectId')),d=await json(c);
    if(!['PASS','FAIL'].includes(d?.status)||!good(d.note,4000))fail(422,'Status dan catatan retest wajib');
    await q(c,'BEGIN');
    try{
      const locked=await first(c,'SELECT id,status FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);
      if(locked?.status!=='DRAFT')fail(409,'Hanya sesi DRAFT dapat diretest');
      const defect=await first(c,'SELECT item_id,status FROM ulo_defects WHERE sesi_id=$1 AND id=$2 FOR UPDATE',[sid,did]);
      if(!defect||!['FIXED','REOPENED'].includes(defect.status))fail(409,'Defect harus FIXED/REOPENED sebelum retest');
      const out=await first(c,'INSERT INTO ulo_retests(defect_id,actor_id,status,note) VALUES($1,$2,$3,$4) RETURNING *',[did,c.get('uid'),d.status,d.note.trim()]);
      const old=await first(c,'SELECT no,status,hasil FROM ulo_item WHERE id=$1 FOR UPDATE',[defect.item_id]);
      await q(c,'UPDATE ulo_item SET status=$1,hasil=$2 WHERE id=$3',[d.status,d.note.trim(),defect.item_id]);
      await q(c,'UPDATE ulo_defects SET status=$1,updated_at=now() WHERE id=$2',[d.status==='PASS'?'VERIFIED':'REOPENED',did]);
      await q(c,'INSERT INTO ulo_item_events(project_id,sesi_id,item_no,old_status,new_status,old_hasil,new_hasil,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[pid,sid,old.no,old.status,d.status,old.hasil,d.note.trim(),c.get('uid')]);
      const change=await first(c,'UPDATE ulo_sesi SET revision=revision+1 WHERE id=$1 RETURNING revision',[sid]);
      c.set('pid',pid);await audit(c,'DEFECT_RETESTED','defect',did,{result:d.status,revision:Number(change.revision)});
      await q(c,'COMMIT');
      if(publishLive)await publishLive(c,'DEFECT_RETESTED',sid,Number(change.revision));
      return c.json(out,201);
    }catch(e){await q(c,'ROLLBACK');throw e;}
  });
  app.get('/api/sesi/:sesiId/defects/:defectId/comments',async c=>{
    await guard(c,'sesiId');const sid=id(c.req.param('sesiId')),did=id(c.req.param('defectId'));
    const exists=await first(c,'SELECT 1 FROM ulo_defects WHERE id=$1 AND sesi_id=$2',[did,sid]);if(!exists)fail(404,'Defect tidak ditemukan');
    return c.json((await q(c,'SELECT id,actor_id,comment,created_at FROM ulo_defect_comments WHERE defect_id=$1 ORDER BY id',[did])).rows);
  });
  app.post('/api/sesi/:sesiId/defects/:defectId/comments',async c=>{
    const pid=await guard(c,'sesiId',['ADMIN','TESTER','WITNESS','APPROVER']),sid=id(c.req.param('sesiId')),did=id(c.req.param('defectId')),d=await json(c);
    if(!good(d?.comment,4000))fail(422,'Komentar harus 1–4000 karakter');
    return atomic(c,async()=>{
      const exists=await first(c,'SELECT 1 FROM ulo_defects WHERE id=$1 AND sesi_id=$2',[did,sid]);
      if(!exists)fail(404,'Defect tidak ditemukan');
      const record=await first(c,'INSERT INTO ulo_defect_comments(defect_id,actor_id,comment) VALUES($1,$2,$3) RETURNING id,actor_id,comment,created_at',[did,c.get('uid'),d.comment.trim()]);
      c.set('pid',pid);await audit(c,'DEFECT_COMMENTED','defect',did,{comment_id:record.id});
      return c.json(record,201);
    });
  });
  app.post('/api/sesi/:sesiId/reopen',async c=>{
    const pid=await guard(c,'sesiId',['ADMIN']),sid=id(c.req.param('sesiId'));
    await q(c,'BEGIN');
    try{
      const session=await first(c,'SELECT status,revision FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);
      if(session?.status!=='FINAL')fail(409,'Hanya sesi FINAL yang dapat dibuka ulang');
      const result=await first(c,"UPDATE ulo_sesi SET status='DRAFT',revision=revision+1,finalized_at=NULL WHERE id=$1 RETURNING *",[sid]);
      c.set('pid',pid);await audit(c,'SESI_REOPENED','sesi',sid,{previous_revision:session.revision});
      await q(c,'COMMIT');return c.json(result);
    }catch(error){await q(c,'ROLLBACK');throw error;}
  });
  app.get('/api/sesi/:sesiId/approvals',async c=>{
    await guard(c,'sesiId');const sid=id(c.req.param('sesiId'));
    return c.json((await q(c,'SELECT a.id,a.revision,a.role,a.decision,a.note,a.occurred_at,u.nama FROM ulo_approvals a JOIN users u ON u.id=a.actor_id WHERE a.sesi_id=$1 ORDER BY a.id',[sid])).rows);
  });
  app.post('/api/sesi/:sesiId/approvals',async c=>{
    const pid=await guard(c,'sesiId',['WITNESS','APPROVER']),sid=id(c.req.param('sesiId')),d=await json(c);
    if(!['APPROVED','REJECTED'].includes(d?.decision))fail(422,'Decision wajib APPROVED/REJECTED');
    const currentRole=await role(c,pid);
    await q(c,'BEGIN');
    try{
      const ses=await first(c,'SELECT status,revision,finalized_at FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);
      if(ses?.status!=='FINAL')fail(409,'Sesi harus FINAL');
      // Legacy staging sessions marked FINAL before workflow migration must be reopened and validated.
      if(!ses.finalized_at)fail(409,'Sesi FINAL lama belum diverifikasi; admin harus buka ulang dan finalisasi dengan aturan baru');
      // Validate at approval time as well, so a pre-migration or corrupt FINAL cannot be signed.
      const plan=(await q(c,'SELECT no,kategori,kebutuhan,urutan FROM test_plan_items WHERE project_id=$1 ORDER BY urutan',[pid])).rows;
      const cases=(await q(c,'SELECT no,kategori,kebutuhan,hasil,status,urutan FROM ulo_item WHERE sesi_id=$1 ORDER BY urutan',[sid])).rows;
      const project=await first(c,'SELECT require_gate_x FROM projects WHERE id=$1',[pid]);
      const defects=(await q(c,"SELECT d.status,d.resolution_note,i.no AS item_no,(SELECT r.status FROM ulo_retests r WHERE r.defect_id=d.id ORDER BY r.id DESC LIMIT 1) AS last_retest FROM ulo_defects d JOIN ulo_item i ON i.id=d.item_id WHERE d.sesi_id=$1",[sid])).rows;
      const validation=checkApprovalState(ses,cases,plan,{requireGateX:project.require_gate_x,defects});
      if(!validation.ok)fail(422,'Sesi FINAL tidak lolos validasi: '+validation.reason);
      const previous=(await q(c,'SELECT role,decision,actor_id FROM ulo_approvals WHERE sesi_id=$1 AND revision=$2',[sid,ses.revision])).rows;
      if(previous.some(x=>x.role===currentRole))fail(409,'Role telah memberi keputusan');
      if(currentRole==='APPROVER'&&!previous.some(x=>x.role==='WITNESS'&&x.decision==='APPROVED'))fail(409,'Persetujuan saksi wajib terlebih dahulu');
      if(previous.some(x=>x.actor_id===c.get('uid')))fail(403,'Approver dan saksi harus berbeda');
      const approval=await first(c,'INSERT INTO ulo_approvals(project_id,sesi_id,revision,role,decision,actor_id,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[pid,sid,ses.revision,currentRole,d.decision,c.get('uid'),optional(d.note)]);
      if(d.decision==='REJECTED')await q(c,"UPDATE ulo_sesi SET status='DRAFT',revision=revision+1,finalized_at=NULL WHERE id=$1",[sid]);
      else if(currentRole==='APPROVER')await q(c,"UPDATE ulo_sesi SET status='SIGNED' WHERE id=$1",[sid]);
      c.set('pid',pid);await audit(c,'SESI_APPROVAL_RECORDED','sesi',sid,{revision:ses.revision,role:currentRole,decision:d.decision});
      await q(c,'COMMIT');return c.json(approval,201);
    }catch(e){await q(c,'ROLLBACK');throw e;}
  });
  app.get('/api/sesi/:sesiId/items/:itemId/evidence',async c=>{
    await guard(c,'sesiId');const sid=id(c.req.param('sesiId')),iid=id(c.req.param('itemId'));
    if(!await first(c,'SELECT id FROM ulo_item WHERE sesi_id=$1 AND id=$2',[sid,iid]))fail(404,'Item tidak ditemukan');
    return c.json((await q(c,'SELECT id,filename,mime,byte_size,sha256,uploaded_by,created_at FROM ulo_evidence WHERE sesi_id=$1 AND item_id=$2 AND deleted_at IS NULL ORDER BY id DESC',[sid,iid])).rows);
  });
  app.post('/api/sesi/:sesiId/items/:itemId/evidence',async c=>{
    const pid=await guard(c,'sesiId',['ADMIN','TESTER']),sid=id(c.req.param('sesiId')),iid=id(c.req.param('itemId'));
    if(!String(c.req.header('content-type')||'').startsWith('multipart/form-data'))fail(415,'Multipart/form-data wajib');
    const form=await c.req.formData().catch(()=>fail(400,'Multipart tidak valid'));
    const file=form.get('file');
    if(!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>PRIVATE_STORAGE_LIMITS.evidenceFile)fail(413,'Bukti maksimal 4 MiB');
    const bytes=new Uint8Array(await file.arrayBuffer());let mime;
    if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46) mime='application/pdf';
    else if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47) mime='image/png';
    else if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) mime='image/jpeg';
    else fail(415,'Format bukti harus PDF, PNG, atau JPEG');
    const digest=createHash('sha256').update(bytes).digest('hex');
    const name=String(file.name||'evidence').replace(/[^\w.() -]/g,'_').slice(0,180);
    let createdKey=null;
    try {return await atomic(c,async()=>{
      // Release the row locks only after both evidence insert and audit commit.
      // This also prevents concurrent upload #11 and changes after finalization.
      // Project lock serializes the global physical-byte budget across sessions.
      await q(c,'SELECT id FROM projects WHERE id=$1 FOR UPDATE',[pid]);
      const session=await first(c,'SELECT status FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);
      if(session?.status!=='DRAFT')fail(409,'Hanya sesi DRAFT dapat diubah');
      const item=await first(c,'SELECT id FROM ulo_item WHERE sesi_id=$1 AND id=$2 FOR UPDATE',[sid,iid]);
      if(!item)fail(404,'Item tidak ditemukan');
      const existing=await first(c,'SELECT count(*)::int AS total FROM ulo_evidence WHERE item_id=$1 AND deleted_at IS NULL',[iid]);
      if(existing.total>=PRIVATE_STORAGE_LIMITS.evidenceItemCount)fail(409,'Maksimal 10 bukti aktif per test case');
      // Count all stored bytes including soft-deleted evidence: delete is a
      // tombstone operation, not physical storage reclamation.
      const projectUsage=await first(c,'SELECT coalesce(sum(byte_size),0)::bigint AS total_bytes FROM ulo_evidence WHERE project_id=$1',[pid]);
      if(wouldExceedQuota(projectUsage.total_bytes,bytes.length,PRIVATE_STORAGE_LIMITS.evidenceProjectBytes)){
        fail(413,'Kapasitas bukti per project mencapai '+storageMiB(PRIVATE_STORAGE_LIMITS.evidenceProjectBytes));
      }
      const sessionUsage=await first(c,'SELECT coalesce(sum(byte_size),0)::bigint AS total_bytes FROM ulo_evidence WHERE sesi_id=$1',[sid]);
      if(wouldExceedQuota(sessionUsage.total_bytes,bytes.length,PRIVATE_STORAGE_LIMITS.evidenceSessionBytes)){
        fail(413,'Kapasitas bukti per sesi mencapai '+storageMiB(PRIVATE_STORAGE_LIMITS.evidenceSessionBytes));
      }
      createdKey=await storeFile(c.env,pid,'evidence',bytes,mime,digest);
      const row=await first(c,'INSERT INTO ulo_evidence(project_id,sesi_id,item_id,filename,mime,byte_size,sha256,data,storage_key,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,filename,mime,byte_size,sha256,created_at',[pid,sid,iid,name,mime,bytes.length,digest,createdKey?null:Buffer.from(bytes),createdKey,c.get('uid')]);
      c.set('pid',pid);await audit(c,'EVIDENCE_UPLOADED','evidence',row.id,{item_id:iid});
      return c.json(row,201);
    });}catch(error){await cleanupUncommitted(c.env,createdKey);throw error;}
  });
  app.get('/api/sesi/:sesiId/items/:itemId/evidence/:evidenceId/download',async c=>{
    await guard(c,'sesiId');const sid=id(c.req.param('sesiId')),iid=id(c.req.param('itemId')),eid=id(c.req.param('evidenceId'));
    const row=await first(c,'SELECT data,storage_key,sha256,byte_size,mime,filename FROM ulo_evidence WHERE sesi_id=$1 AND item_id=$2 AND id=$3 AND deleted_at IS NULL',[sid,iid,eid]);
    if(!row)fail(404,'Bukti tidak ditemukan');
    if(row.storage_key){
      if(!storageEnabled(c.env))fail(503,'Koneksi Storage belum tersedia');
      const bytes=await readFile(c.env,row.storage_key,row.sha256,row.byte_size).catch(()=>fail(503,'Unduh Storage atau verifikasi checksum gagal'));
      return fileDownload(bytes,row.mime,row.filename);
    }
    return fileDownload(row.data,row.mime,row.filename);
  });
  app.delete('/api/sesi/:sesiId/items/:itemId/evidence/:evidenceId',async c=>{
    const pid=await guard(c,'sesiId',['ADMIN']),sid=id(c.req.param('sesiId')),iid=id(c.req.param('itemId')),eid=id(c.req.param('evidenceId'));
    return atomic(c,async()=>{
      const session=await first(c,'SELECT status FROM ulo_sesi WHERE id=$1 FOR UPDATE',[sid]);
      if(session?.status!=='DRAFT')fail(409,'Hanya sesi DRAFT dapat diubah');
      if(!await first(c,'UPDATE ulo_evidence SET deleted_at=now(),deleted_by=$1 WHERE sesi_id=$2 AND item_id=$3 AND id=$4 AND deleted_at IS NULL RETURNING id',[c.get('uid'),sid,iid,eid]))fail(404,'Bukti tidak ditemukan');
      c.set('pid',pid);await audit(c,'EVIDENCE_DELETED','evidence',eid);
      return c.body(null,204);
    });
  });

}