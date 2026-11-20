import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {api} from '@/api/client';
import {useAuth} from '@/store/authStore';
import {useToast} from '@/components/Toast';

interface Case {id?:number;no:string;status:string;hasil?:string}
interface Defect {id:number;item_no:string;title:string;description:string|null;severity:string;status:string;resolution_note:string|null;owner_id?:number|null;}
interface Evidence {id:number;filename:string;byte_size:number;sha256:string;created_at:string;}
interface Approval {id:number;role:string;decision:string;nama:string;occurred_at:string;revision:number;}
interface ItemHistory {item_no:string;old_status:string;new_status:string;actor_id:number;occurred_at:string;}
interface DefectComment {id:number;actor_id:number;comment:string;created_at:string}
interface RetestRecord {id:number;status:string;note:string;actor_id:number;recorded_at:string}
interface Member {id:number;nama:string;email:string;role:string}
const btn='rounded bg-blue-700 px-3 py-2 text-white text-sm disabled:opacity-50';
const input='rounded border p-2 text-sm w-full';
const downloadBlob=(blob:Blob,name:string)=>{
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name;link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
};
export function UatWorkflowPanel({sessionId,projectId,status,items}:{sessionId:number;projectId:number;status:string;items:Case[]}){
  const qc=useQueryClient(),toast=useToast();
  const role=useAuth(s=>s.user?.projects.find(p=>p.project_id===projectId)?.role);
  const [itemId,setItemId]=useState<number|undefined>(undefined);
  const [actionStatus,setActionStatus]=useState<Record<number,string>>({});
  const [retestNote,setRetestNote]=useState<Record<number,string>>({});
  const [waiverNote,setWaiverNote]=useState<Record<number,string>>({});
  const [approvalNote,setApprovalNote]=useState('');
  const [commentDraft,setCommentDraft]=useState<Record<number,string>>({});
  const {data:defects=[]}=useQuery({queryKey:['defects',sessionId],queryFn:()=>api.get<Defect[]>('/sesi/'+sessionId+'/defects').then(r=>r.data)});
  const defectKey=defects.map(d=>d.id).join(',');
  const {data:commentsByDefect={}}=useQuery({queryKey:['defect-comments',sessionId,defectKey],enabled:defects.length>0,
    queryFn:async()=>Object.fromEntries(await Promise.all(defects.map(async d=>[d.id,(await api.get<DefectComment[]>('/sesi/'+sessionId+'/defects/'+d.id+'/comments')).data]))) as Record<number,DefectComment[]>});
  const {data:retestsByDefect={}}=useQuery({queryKey:['defect-retests',sessionId,defectKey],enabled:defects.length>0,
    queryFn:async()=>Object.fromEntries(await Promise.all(defects.map(async d=>[d.id,(await api.get<RetestRecord[]>('/sesi/'+sessionId+'/defects/'+d.id+'/retests')).data]))) as Record<number,RetestRecord[]>});
  const {data:members=[]}=useQuery({queryKey:['members',projectId],enabled:role==='ADMIN',queryFn:()=>api.get<Member[]>('/projects/'+projectId+'/members').then(r=>r.data)});
  const {data:approvals=[]}=useQuery({queryKey:['approvals',sessionId],queryFn:()=>api.get<Approval[]>('/sesi/'+sessionId+'/approvals').then(r=>r.data)});
  const {data:history=[]}=useQuery({queryKey:['item-history',sessionId],queryFn:()=>api.get<ItemHistory[]>('/sesi/'+sessionId+'/history').then(r=>r.data)});
  const {data:evidences=[]}=useQuery({queryKey:['evidence',sessionId,itemId],queryFn:()=>api.get<Evidence[]>('/sesi/'+sessionId+'/items/'+itemId+'/evidence').then(r=>r.data),enabled:!!itemId});
  const refresh=()=>{qc.invalidateQueries({queryKey:['defects',sessionId]});qc.invalidateQueries({queryKey:['defect-retests',sessionId]});qc.invalidateQueries({queryKey:['item-history',sessionId]});qc.invalidateQueries({queryKey:['sesi',sessionId]});};
  const updateDefect=useMutation({mutationFn:({id,payload}:{id:number;payload:unknown})=>api.patch('/sesi/'+sessionId+'/defects/'+id,payload),
    onSuccess:()=>{refresh();toast.push('success','Defect diperbarui')},onError:(e:Error)=>toast.push('error',e.message)});
  const retest=useMutation({mutationFn:({id,result}:{id:number;result:'PASS'|'FAIL'})=>api.post('/sesi/'+sessionId+'/defects/'+id+'/retests',{status:result,note:retestNote[id]}),
    onSuccess:()=>{refresh();toast.push('success','Retest dicatat')},onError:(e:Error)=>toast.push('error',e.message)});
  const comment=useMutation({mutationFn:(id:number)=>api.post('/sesi/'+sessionId+'/defects/'+id+'/comments',{comment:commentDraft[id]}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['defect-comments',sessionId]});toast.push('success','Komentar defect dicatat');setCommentDraft({})},onError:(e:Error)=>toast.push('error',e.message)});
  const approval=useMutation({mutationFn:(decision:string)=>api.post('/sesi/'+sessionId+'/approvals',{decision,note:approvalNote}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['approvals',sessionId]});qc.invalidateQueries({queryKey:['sesi',sessionId]});toast.push('success','Keputusan tercatat')},
    onError:(e:Error)=>toast.push('error',e.message)});
  const upload=useMutation({mutationFn:async(file:File)=>{
    if(!itemId)throw Error('Pilih test case');
    if(file.size>4*1024*1024)throw Error('Batas bukti 4 MiB');
    const form=new FormData();form.append('file',file);
    return api.post('/sesi/'+sessionId+'/items/'+itemId+'/evidence',form);
  },onSuccess:()=>{qc.invalidateQueries({queryKey:['evidence',sessionId,itemId]});toast.push('success','Bukti tersimpan')},
    onError:(e:Error)=>toast.push('error',e.message)});
  const removeEvidence=useMutation({mutationFn:(evidenceId:number)=>{
      if(!itemId)throw Error('Pilih test case');
      return api.delete('/sesi/'+sessionId+'/items/'+itemId+'/evidence/'+evidenceId);
    },onSuccess:()=>{qc.invalidateQueries({queryKey:['evidence',sessionId,itemId]});toast.push('success','Bukti diarsipkan; riwayat tetap disimpan')},
      onError:(e:Error)=>toast.push('error',e.message)});
  const download=async(ev:Evidence)=>{
    if(!itemId)return;
    try{const {data}=await api.get<Blob>('/sesi/'+sessionId+'/items/'+itemId+'/evidence/'+ev.id+'/download',{responseType:'blob'});downloadBlob(data,ev.filename);}
    catch(e){toast.push('error',e instanceof Error?e.message:'Unduh gagal');}
  };
  return <div className="space-y-5 mt-6">
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold mb-2">Defect & Retest ({defects.length})</h2>
      <p className="text-sm text-slate-600 mb-4">Status FAIL otomatis membuat defect. Defect perlu diperbaiki, retest PASS, atau waiver tertulis dari APPROVER sebelum sesi dapat difinalisasi.</p>
      {defects.length===0&&<p className="text-sm text-slate-500">Tidak ada defect yang tercatat.</p>}
      {defects.map(d=><article key={d.id} className="border-t py-4 space-y-2 text-sm">
        <p><b>{d.item_no}</b> · {d.title} <span className="ml-2 font-semibold">{d.status}</span> · {d.severity}</p>
        <p className="text-slate-600">{d.description||'Belum ada uraian'}</p>
        {d.resolution_note&&<p>Waiver/alasan: {d.resolution_note}</p>}
        {status==='DRAFT'&&['ADMIN','TESTER'].includes(role||'')&&<div className="flex flex-wrap items-center gap-2">
          <label className="text-xs">Severity <select aria-label={'Severity defect '+d.item_no} className={input}
            value={d.severity} disabled={updateDefect.isPending}
            onChange={e=>updateDefect.mutate({id:d.id,payload:{severity:e.target.value}})}>
            {(['LOW','MEDIUM','HIGH','CRITICAL'] as const).map(severity=><option key={severity} value={severity}>{severity}</option>)}
          </select></label>
          {role==='ADMIN'&&<label className="text-xs">Penanggung jawab <select className={input}
            aria-label={'Penanggung jawab defect '+d.item_no} value={d.owner_id||''}
            onChange={e=>updateDefect.mutate({id:d.id,payload:{owner_id:e.target.value?Number(e.target.value):null}})}>
            <option value="">Belum ditugaskan</option>{members.filter(m=>['TESTER','ADMIN'].includes(m.role)).map(m=><option value={m.id} key={m.id}>{m.nama}</option>)}
          </select></label>}
        </div>}
        {status==='DRAFT'&&['ADMIN','TESTER','APPROVER'].includes(role||'')&&<div className="grid gap-2 md:grid-cols-3">
          <select aria-label={'Status defect '+d.item_no} className={input} value={actionStatus[d.id]||''} onChange={e=>setActionStatus({...actionStatus,[d.id]:e.target.value})}>
            <option value="">Pilih status berikutnya</option>
            {(['IN_PROGRESS','FIXED','REOPENED','WAIVED'] as const).map(st=><option key={st} value={st}>{st}</option>)}
          </select>
          {actionStatus[d.id]==='WAIVED'&&<input className={input} placeholder="Alasan waiver wajib" value={waiverNote[d.id]||''} onChange={e=>setWaiverNote({...waiverNote,[d.id]:e.target.value})}/>}
          <button className={btn} disabled={!actionStatus[d.id]||updateDefect.isPending} onClick={()=>updateDefect.mutate({id:d.id,payload:{status:actionStatus[d.id],resolution_note:waiverNote[d.id]||undefined}})}>Ubah status</button>
        </div>}
        {status==='DRAFT'&&['ADMIN','TESTER'].includes(role||'')&&['FIXED','REOPENED'].includes(d.status)&&<div className="flex flex-wrap gap-2">
          <input className={input+' md:w-2/3'} placeholder="Catatan hasil retest wajib" aria-label={'Catatan retest '+d.item_no} value={retestNote[d.id]||''} onChange={e=>setRetestNote({...retestNote,[d.id]:e.target.value})}/>
          <button className={btn} disabled={!retestNote[d.id]||retest.isPending} onClick={()=>retest.mutate({id:d.id,result:'PASS'})}>Retest PASS</button>
          <button className={btn} disabled={!retestNote[d.id]||retest.isPending} onClick={()=>retest.mutate({id:d.id,result:'FAIL'})}>Retest FAIL</button>
        </div>}
        {(retestsByDefect[d.id]||[]).length>0&&<details className="rounded bg-slate-50 p-2"><summary className="cursor-pointer">Riwayat retest ({retestsByDefect[d.id].length})</summary>
          {retestsByDefect[d.id].map(r=><p key={r.id} className="text-xs py-1">{r.status} · {r.note} · aktor #{r.actor_id} · {new Date(r.recorded_at).toLocaleString('id-ID')}</p>)}
        </details>}
        {(commentsByDefect[d.id]||[]).length>0&&<details className="rounded bg-slate-50 p-2"><summary className="cursor-pointer">Komentar ({commentsByDefect[d.id].length})</summary>
          {commentsByDefect[d.id].map(k=><p key={k.id} className="text-xs py-1">{k.comment} · aktor #{k.actor_id} · {new Date(k.created_at).toLocaleString('id-ID')}</p>)}
        </details>}
        {status==='DRAFT'&&['ADMIN','TESTER','WITNESS','APPROVER'].includes(role||'')&&<div className="flex gap-2">
          <input aria-label={'Komentar defect '+d.item_no} placeholder="Komentar defect" className={input+' md:w-2/3'} value={commentDraft[d.id]||''} onChange={e=>setCommentDraft({...commentDraft,[d.id]:e.target.value})}/>
          <button className={btn} disabled={!commentDraft[d.id]||comment.isPending} onClick={()=>comment.mutate(d.id)}>Komentar</button>
        </div>}
      </article>)}
    </section>
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold mb-2">Bukti Uji / Evidence</h2>
      <p className="text-sm text-slate-600 mb-3">Pilih test case, lalu unggah PDF/PNG/JPEG maksimal 4 MiB. Bukti hanya dapat diunduh oleh anggota project.</p>
      <select className={input} aria-label="Pilih item untuk bukti" value={itemId||''} onChange={e=>setItemId(Number(e.target.value)||undefined)}>
        <option value="">Pilih test case</option>
        {items.filter(i=>i.id).map(i=><option key={i.id} value={i.id}>{i.no} — {i.status}</option>)}
      </select>
      {itemId&&<div className="mt-3">
        {status==='DRAFT'&&['ADMIN','TESTER'].includes(role||'')&&<label className="text-sm">Unggah bukti:
          <input type="file" accept="application/pdf,image/png,image/jpeg" aria-label="File bukti" disabled={upload.isPending}
            onChange={e=>{const file=e.target.files?.[0];if(file)upload.mutate(file)}} className="block mt-2"/>
        </label>}
        {evidences.map(e=><div key={e.id} className="py-2 flex justify-between border-t text-sm"><span>{e.filename} · {(e.byte_size/1024).toFixed(1)} KiB</span>
          <span className="flex gap-3 items-center"><button className="text-blue-700 underline" onClick={()=>download(e)}>Unduh</button>
            {status==='DRAFT'&&['ADMIN','TESTER'].includes(role||'')&&<button type="button" className="text-red-700 underline"
              disabled={removeEvidence.isPending} onClick={()=>{if(window.confirm('Arsipkan bukti ini? Bukti historis tetap tersimpan.'))removeEvidence.mutate(e.id)}}>Arsipkan</button>}
          </span></div>)}
      </div>}
    </section>
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold mb-2">Persetujuan Saksi dan Approver</h2>
      <p className="text-sm text-slate-600 mb-3">Sesi harus FINAL sebelum saksi dan approver memberi keputusan. Dua peran wajib diisi oleh orang berbeda. Ini adalah persetujuan aplikasi, bukan tanda tangan PKI tersertifikasi.</p>
      {approvals.map(a=><div className="text-sm py-2 border-t" key={a.id}>{a.role} · {a.decision} · {a.nama} · revisi {a.revision} · {new Date(a.occurred_at).toLocaleString('id-ID')}</div>)}
      {status==='FINAL'&&['WITNESS','APPROVER'].includes(role||'')&&<div className="space-y-2 mt-2">
        <textarea className={input} aria-label="Catatan keputusan" placeholder="Catatan persetujuan/penolakan" rows={2} value={approvalNote} onChange={e=>setApprovalNote(e.target.value)}/>
        <div className="flex gap-2"><button className={btn} disabled={approval.isPending} onClick={()=>approval.mutate('APPROVED')}>Setujui</button>
          <button className={btn} disabled={approval.isPending||!approvalNote.trim()} onClick={()=>approval.mutate('REJECTED')}>Tolak</button></div>
      </div>}
    </section>
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Riwayat Hasil UAT</h2>
      <p className="text-xs text-slate-500 mb-3">Riwayat append-only; setiap perubahan hasil dan retest tercatat.</p>
      <div className="max-h-56 overflow-auto">{history.map((h,i)=><p className="text-xs py-2 border-t" key={i}>{h.item_no} · {h.old_status} → {h.new_status} · aktor #{h.actor_id} · {new Date(h.occurred_at).toLocaleString('id-ID')}</p>)}</div>
    </section>
  </div>;
}