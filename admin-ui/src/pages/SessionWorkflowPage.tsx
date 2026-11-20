import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { sesiApi } from '@/api/sesi';
import { useAuth } from '@/store/authStore';
import { PageHeader } from '@/components/PageHeader';
import { inputCls } from '@/components/FormField';
import { useToast } from '@/components/Toast';

type Defect={id:number;item_no:string;title:string;description:string|null;severity:string;status:string;resolution_note:string|null};
type Approval={id:number;revision:number;role:string;decision:string;note:string|null;nama:string;occurred_at:string};
type Evidence={id:number;filename:string;byte_size:number;mime:string;created_at:string};
const btn='rounded-md bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-50';
const box='rounded-lg border border-slate-200 bg-white p-4';
const load=<T,>(url:string)=>api.get<T>(url).then(x=>x.data);

function EvidencePanel({sid,iid,canEdit}:{sid:number;iid:number;canEdit:boolean}){
 const toast=useToast();const qc=useQueryClient();
 const url='/sesi/'+sid+'/items/'+iid+'/evidence';
 const {data:files=[]}=useQuery({queryKey:['evidence',sid,iid],queryFn:()=>load<Evidence[]>(url)});
 const [uploading,setUploading]=useState(false);
 const upload=async(file:File)=>{
  setUploading(true);try{
   const form=new FormData();form.append('file',file);
   await api.post(url,form,{headers:{'Content-Type':'multipart/form-data'}});
   qc.invalidateQueries({queryKey:['evidence',sid,iid]});toast.push('success','Bukti tersimpan');
  }catch(e){toast.push('error',e instanceof Error?e.message:'Upload gagal');}finally{setUploading(false);}
 };
 const download=async(f:Evidence)=>{
  try{
   const r=await api.get<Blob>(url+'/'+f.id+'/download',{responseType:'blob'});
   const object=URL.createObjectURL(r.data);
   const a=document.createElement('a');a.href=object;a.download=f.filename;a.click();
   setTimeout(()=>URL.revokeObjectURL(object),60000);
  }catch(e){toast.push('error',e instanceof Error?e.message:'Download gagal');}
 };
 return <div className="space-y-2">
  <div className="flex flex-wrap gap-2">{files.map(f=><button key={f.id} className="text-xs text-blue-700 hover:underline" onClick={()=>download(f)}>{f.filename} ({Math.ceil(f.byte_size/1024)} KB)</button>)}</div>
  {canEdit&&<label className="text-xs text-slate-600 cursor-pointer">Unggah bukti PNG/JPEG/PDF (maks 4 MiB)
   <input aria-label={'Unggah bukti item '+iid} className="block text-xs mt-1" type="file" accept=".png,.jpg,.jpeg,.pdf" disabled={uploading} onChange={e=>{const f=e.target.files?.[0];if(f)upload(f);e.target.value='';}}/>
  </label>}
 </div>;
}

export function SessionWorkflowPage(){
 const {id}=useParams<{id:string}>();const sid=Number(id);const qc=useQueryClient();const toast=useToast();
 const {user}=useAuth();
 const [tab,setTab]=useState<'defects'|'evidence'|'approvals'|'history'>('defects');
 const [search,setSearch]=useState('');
 const [notes,setNotes]=useState<Record<number,string>>({});
 const [status,setStatus]=useState<Record<number,string>>({});
 const [retest,setRetest]=useState<Record<number,string>>({});
 const [decisionNote,setDecisionNote]=useState('');
 const [decision,setDecision]=useState<'APPROVED'|'REJECTED'>('APPROVED');
 const {data:session}=useQuery({queryKey:['sesi',sid],queryFn:()=>sesiApi.get(sid)});
 const {data:defects=[]}=useQuery({queryKey:['defects',sid],queryFn:()=>load<Defect[]>('/sesi/'+sid+'/defects')});
 const {data:approvals=[]}=useQuery({queryKey:['approvals',sid],queryFn:()=>load<Approval[]>('/sesi/'+sid+'/approvals')});
 const {data:history=[]}=useQuery({queryKey:['history',sid],queryFn:()=>load<{item_no:string;old_status:string;new_status:string;occurred_at:string;actor_id:number}[]>('/sesi/'+sid+'/history'),enabled:tab==='history'});
 const role=user?.projects.find(x=>x.project_id===session?.project_id)?.role;
 const canEdit=!!session&&session.status==='DRAFT'&&(role==='ADMIN'||role==='TESTER');
 const canApprove=session?.status==='FINAL'&&(role==='WITNESS'||role==='APPROVER');
 const mutation=useMutation({
  mutationFn:async(action:{path:string;method?:'post'|'patch';body:unknown})=>api.request({url:action.path,method:action.method||'post',data:action.body}),
  onSuccess:()=>{
   for(const k of ['sesi','defects','approvals','history'])qc.invalidateQueries({queryKey:[k,sid]});
   toast.push('success','Data workflow diperbarui');
  },
  onError:(e:Error)=>toast.push('error',e.message)
 });
 const action=(path:string,body:unknown,method:'post'|'patch'='post')=>mutation.mutate({path,body,method});
 const unresolved=defects.filter(x=>!['VERIFIED','WAIVED'].includes(x.status));
 const failureItems=(session?.items||[]).filter(i=>i.status==='FAIL');
 return <div className="space-y-5">
  <PageHeader title={'Workflow UAT — Sesi #'+sid} subtitle={'Status '+(session?.status||'Memuat')+' • '+failureItems.length+' test case FAIL • '+unresolved.length+' defect belum terselesaikan'}/>
  <Link to={'/sesi/'+sid} className="text-sm text-blue-700 hover:underline">Kembali ke lembar pengujian</Link>
  <div role="tablist" aria-label="Workflow sesi" className="flex flex-wrap gap-2">
   {(['defects','evidence','approvals','history'] as const).map(t=><button role="tab" aria-selected={tab===t} key={t} onClick={()=>setTab(t)} className={tab===t?btn:'rounded-md bg-slate-100 px-3 py-2 text-sm'}>{({defects:'Defect & retest',evidence:'Bukti pengujian',approvals:'Persetujuan',history:'Riwayat item'})[t]}</button>)}
  </div>
  {tab==='defects'&&<div className={box}>
   <h2 className="font-semibold mb-3">Defect ({defects.length})</h2>
   <p className="text-xs text-slate-500 mb-3">Defect otomatis dibuat ketika hasil item berubah ke FAIL. Tetapkan status FIXED sebelum retest. Retest PASS mengubah defect menjadi VERIFIED dan test case menjadi PASS.</p>
   <div className="space-y-4">{defects.map(d=><div key={d.id} className="rounded-md border p-3">
    <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{d.item_no} — {d.title}</strong><span className="text-xs">{d.severity} · {d.status}</span></div>
    {d.description&&<p className="my-2 text-sm text-slate-600">{d.description}</p>}
    {canEdit&&<div className="mt-3 flex flex-wrap items-center gap-2">
     <select aria-label={'Status defect '+d.id} className={inputCls} value={status[d.id]||d.status} onChange={e=>setStatus({...status,[d.id]:e.target.value})}>{['OPEN','IN_PROGRESS','FIXED','REOPENED','VERIFIED','WAIVED'].map(x=><option key={x}>{x}</option>)}</select>
     <input aria-label={'Resolusi defect '+d.id} className={inputCls} value={notes[d.id]||''} placeholder="Catatan / resolusi" onChange={e=>setNotes({...notes,[d.id]:e.target.value})}/>
     <button className={btn} disabled={mutation.isPending} onClick={()=>action('/sesi/'+sid+'/defects/'+d.id,{status:status[d.id]||d.status,resolution_note:notes[d.id]||null},'patch')}>Simpan</button>
    </div>}
    {canEdit&&['FIXED','REOPENED'].includes(d.status)&&<div className="mt-3 flex flex-wrap gap-2 items-center">
     <select className={inputCls} aria-label={'Retest '+d.id} value={retest[d.id]||'PASS'} onChange={e=>setRetest({...retest,[d.id]:e.target.value})}><option>PASS</option><option>FAIL</option></select>
     <button disabled={mutation.isPending||!notes[d.id]?.trim()} className={btn} onClick={()=>action('/sesi/'+sid+'/defects/'+d.id+'/retests',{status:retest[d.id]||'PASS',note:notes[d.id]})}>Simpan retest</button>
    </div>}
   </div>)}</div>
   {defects.length===0&&<p className="text-sm text-slate-500">Belum ada defect pada sesi ini.</p>}
  </div>}
  {tab==='evidence'&&<div className={box}><h2 className="font-semibold mb-3">Evidence per test case</h2>
   <input aria-label="Cari item untuk evidence" value={search} placeholder="Cari nomor atau kebutuhan" onChange={e=>setSearch(e.target.value)} className={inputCls}/>
   <div className="space-y-3 mt-3">{(session?.items||[]).filter(i=>(i.no+' '+i.kebutuhan).toLowerCase().includes(search.toLowerCase())).slice(0,30).map(i=><div key={i.id} className="rounded-md border p-3">
    <p className="text-sm font-medium mb-2">{i.no} · {i.kebutuhan} ({i.status})</p>
    {i.id!=null&&<EvidencePanel sid={sid} iid={i.id} canEdit={canEdit}/>}
   </div>)}</div>
   <p className="text-xs text-slate-500 mt-3">Menampilkan maksimal 30 item. Gunakan pencarian untuk item lain.</p>
  </div>}
  {tab==='approvals'&&<div className={box}>
   <h2 className="font-semibold mb-2">Persetujuan saksi & approver</h2>
   <p className="text-xs text-slate-500 mb-3">Saksi dan approver wajib merupakan dua akun berbeda. Persetujuan internal tercatat pada audit trail; ini <strong>bukan</strong> tanda tangan digital tersertifikasi PKI.</p>
   <div className="space-y-2 mb-3">{approvals.map(p=><div key={p.id} className="border-b py-2 text-sm">{p.role}: <strong>{p.decision}</strong> oleh {p.nama} · revisi {p.revision} · {new Date(p.occurred_at).toLocaleString('id-ID')}</div>)}</div>
   {canApprove&&<div className="flex flex-wrap gap-3">
    <select aria-label="Keputusan persetujuan" className={inputCls} value={decision} onChange={e=>setDecision(e.target.value as 'APPROVED'|'REJECTED')}><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option></select>
    <input aria-label="Catatan persetujuan" className={inputCls} placeholder="Catatan keputusan" value={decisionNote} onChange={e=>setDecisionNote(e.target.value)}/>
    <button disabled={mutation.isPending} className={btn} onClick={()=>action('/sesi/'+sid+'/approvals',{decision,note:decisionNote})}>Rekam keputusan</button>
   </div>}
   {session?.status==='SIGNED'&&<p className="text-sm font-medium text-green-700">Workflow persetujuan internal sudah selesai (SIGNED).</p>}
  </div>}
  {tab==='history'&&<div className={box}><h2 className="font-semibold mb-3">Riwayat perubahan hasil test case</h2>
   <div className="space-y-2">{history.map((x,j)=><div key={j} className="border-b py-2 text-xs">Item {x.item_no}: {x.old_status} → {x.new_status}, oleh #{x.actor_id}, {new Date(x.occurred_at).toLocaleString('id-ID')}</div>)}</div>
   {history.length===0&&<p className="text-sm text-slate-500">Belum ada perubahan item yang tercatat.</p>}
  </div>}
 </div>;
}
