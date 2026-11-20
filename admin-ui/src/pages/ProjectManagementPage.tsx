import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/store/authStore';
import { PageHeader } from '@/components/PageHeader';
import { inputCls } from '@/components/FormField';
import { useToast } from '@/components/Toast';

type Role='ADMIN'|'TESTER'|'WITNESS'|'APPROVER'|'AUDITOR';
type Member={id:number;email:string;nama:string;role:Role;aktif:boolean};
type Person={id:number;kind:'PENGUJI'|'SAKSI';nama:string;jabatan:string|null;email:string|null;telepon:string|null;nip:string|null;aktif:boolean};
type Plan={no:string;kategori:string;kebutuhan:string;urutan:number;gate_required:boolean};
type Audit={id:number;action:string;entity_type:string;entity_id:number;occurred_at:string;actor_id:number;metadata:unknown};
type Summary={sessions:{total:number;drafts:number;finals:number;signed:number};items:{total:number;pass:number;fail:number;belum:number};defects:{total:number;unresolved:number}};
const load=<T,>(url:string)=>api.get<T>(url).then(r=>r.data);
const classes='rounded-lg border border-slate-200 bg-white p-4';
const buttons='rounded-md bg-brand-600 px-3 py-2 text-white text-sm disabled:opacity-50';

export function ProjectManagementPage(){
 const {id}=useParams<{id:string}>();const pid=Number(id);const qc=useQueryClient();const toast=useToast();
 const {user}=useAuth();
 const role=user?.projects.find(p=>p.project_id===pid)?.role;
 const admin=role==='ADMIN',auditor=role==='AUDITOR';
 const [tab,setTab]=useState<'dashboard'|'plan'|'members'|'people'|'audit'>('dashboard');
 const [search,setSearch]=useState('');
 const [member,setMember]=useState<{email:string;nama:string;password:string;role:Role}>({email:'',nama:'',password:'',role:'TESTER'});
 const [person,setPerson]=useState({kind:'PENGUJI' as 'PENGUJI'|'SAKSI',nama:'',jabatan:'',email:'',telepon:'',nip:''});
 const [planDraft,setPlanDraft]=useState<Plan[]|null>(null);
 const {data:project}=useQuery({queryKey:['project',pid],queryFn:()=>load<{nama:string;kode:string}>('/projects/'+pid)});
 const {data:summary}=useQuery({queryKey:['dashboard',pid],queryFn:()=>load<Summary>('/projects/'+pid+'/dashboard')});
 const {data:plan=[]}=useQuery({queryKey:['plan',pid],queryFn:()=>load<Plan[]>('/projects/'+pid+'/plan')});
 const {data:members=[]}=useQuery({queryKey:['members',pid],queryFn:()=>load<Member[]>('/projects/'+pid+'/members'),enabled:admin||auditor});
 const {data:people=[]}=useQuery({queryKey:['people',pid],queryFn:()=>load<Person[]>('/projects/'+pid+'/people')});
 const {data:audit=[]}=useQuery({queryKey:['audit',pid],queryFn:()=>load<Audit[]>('/projects/'+pid+'/audit'),enabled:admin||auditor});
 const mutate=useMutation({
  mutationFn:async (v:{url:string;method:'post'|'put'|'patch'|'delete';body?:unknown})=>{
   const response=await api.request({url:v.url,method:v.method,data:v.body});return response.data;
  },
  onSuccess:()=>{
   for(const type of ['dashboard','plan','members','people','audit'])qc.invalidateQueries({queryKey:[type,pid]});
   toast.push('success','Perubahan berhasil disimpan');
  },
  onError:(err:Error)=>toast.push('error',err.message)
 });
 const updateMember=()=>{if(!member.email||!member.nama)return;mutate.mutate({url:'/projects/'+pid+'/members',method:'post',body:member});setMember({email:'',nama:'',password:'',role:'TESTER'});};
 const updatePerson=()=>{if(!person.nama)return;mutate.mutate({url:'/projects/'+pid+'/people',method:'post',body:person});setPerson({...person,nama:'',jabatan:'',email:'',telepon:'',nip:''});};
 const visiblePlan=(planDraft??plan).filter(x=>[x.no,x.kategori,x.kebutuhan].join(' ').toLowerCase().includes(search.toLowerCase()));
 return <div className="space-y-6">
  <PageHeader title={'Kelola project: '+(project?.nama||pid)} subtitle="Dashboard, test plan, anggota, penguji/saksi dan jejak audit" />
  <Link className="text-sm text-blue-700 hover:underline" to={'/projects/'+pid}>Kembali ke project</Link>
  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Modul administrasi project">
   {(['dashboard','plan','members','people','audit'] as const).filter(t=>!['members','audit'].includes(t)||admin||auditor).map(t=>
    <button key={t} role="tab" aria-selected={tab===t} className={'rounded-lg px-3 py-2 text-sm '+(tab===t?'bg-brand-600 text-white':'bg-slate-100 hover:bg-slate-200')} onClick={()=>setTab(t)}>{({dashboard:'Dashboard',plan:'Test plan',members:'Anggota',people:'Penguji & Saksi',audit:'Audit trail'})[t]}</button>
   )}
  </div>
  {tab==='dashboard'&&<div className="grid gap-4 md:grid-cols-3">
   {[
    ['Total sesi',summary?.sessions.total],['Draft',summary?.sessions.drafts],['Final',summary?.sessions.finals],
    ['Signed',summary?.sessions.signed],['Test PASS',summary?.items.pass],['Test FAIL',summary?.items.fail],
    ['Belum diuji',summary?.items.belum],['Defect aktif',summary?.defects.unresolved],['Total test case',summary?.items.total]
   ].map(([label,count])=><div key={String(label)} className={classes}><p className="text-sm text-slate-600">{label}</p><p className="mt-1 text-2xl font-semibold">{count??'—'}</p></div>)}
  </div>}
  {tab==='plan'&&<div className={classes}>
   <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><h2 className="font-semibold">Rencana pengujian kanonis ({plan.length} test case)</h2>
    <div className="flex gap-2">
     <input aria-label="Cari test case" value={search} onChange={e=>setSearch(e.target.value)} className={inputCls} placeholder="Cari kode atau kebutuhan" />
     {admin&&summary?.sessions.total===0&&<button className={buttons} onClick={()=>{if(!planDraft)setPlanDraft(plan.map(x=>({...x})));else {mutate.mutate({url:'/projects/'+pid+'/plan',method:'put',body:{items:planDraft}});setPlanDraft(null);}}}>{planDraft?'Simpan plan':'Edit plan'}</button>}
    </div>
   </div>
   <p className="text-xs text-slate-500 mb-3">Setelah sesi pertama dibuat, katalog test plan dikunci. Kode, kategori dan urutan tidak dapat diubah dari sesi.</p>
   <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr><th className="text-left p-2">No</th><th className="text-left p-2">Kategori</th><th className="text-left p-2">Kebutuhan</th><th className="text-left p-2">Gate</th></tr></thead><tbody>
    {visiblePlan.slice(0,250).map(row=><tr className="border-t" key={row.no}><td className="p-2 font-mono">{row.no}</td><td className="p-2">{row.kategori}</td><td className="p-2">{row.kebutuhan}</td><td className="p-2">{row.gate_required?'Wajib':'—'}</td></tr>)}
   </tbody></table></div>
  </div>}
  {tab==='members'&&(admin||auditor)&&<div className={classes}>
   <h2 className="font-semibold mb-3">Anggota dan hak akses</h2>
   <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr><th className="p-2 text-left">Nama</th><th className="p-2 text-left">Email</th><th className="p-2 text-left">Role</th><th className="p-2 text-left">Aksi</th></tr></thead><tbody>{members.map(m=><tr key={m.id} className="border-t"><td className="p-2">{m.nama}</td><td className="p-2">{m.email}</td><td className="p-2">{m.role}</td><td className="p-2">{admin&&m.id!==user?.id&&<button className="text-red-700 text-xs hover:underline" onClick={()=>{if(confirm('Hapus keanggotaan '+m.email+'?'))mutate.mutate({url:'/projects/'+pid+'/members/'+m.id,method:'delete'});}}>Hapus anggota</button>}</td></tr>)}</tbody></table></div>
   {admin&&<div className="grid gap-3 mt-4 md:grid-cols-2"><input aria-label="Nama anggota" className={inputCls} value={member.nama} placeholder="Nama anggota" onChange={e=>setMember({...member,nama:e.target.value})}/><input aria-label="Email anggota" type="email" className={inputCls} value={member.email} placeholder="Email anggota" onChange={e=>setMember({...member,email:e.target.value})}/>
    <input aria-label="Password akun baru" className={inputCls} type="password" value={member.password} placeholder="Password ≥16 karakter jika pengguna baru" onChange={e=>setMember({...member,password:e.target.value})}/>
    <select aria-label="Role anggota" className={inputCls} value={member.role} onChange={e=>setMember({...member,role:e.target.value as Role})}>{(['ADMIN','TESTER','WITNESS','APPROVER','AUDITOR'] as Role[]).map(x=><option key={x}>{x}</option>)}</select>
    <button className={buttons} disabled={mutate.isPending} onClick={updateMember}>Tambah atau perbarui anggota</button>
   </div>}
  </div>}
  {tab==='people'&&<div className={classes}><h2 className="font-semibold mb-3">Master penguji dan saksi</h2>
   <div className="space-y-2 mb-4">{people.map(p=><div key={p.id} className="border-b py-2 text-sm flex justify-between gap-3"><span>{p.kind} — {p.nama} · {p.jabatan||'Tanpa jabatan'}</span><span>{p.email||''}</span></div>)}</div>
   {admin&&<div className="grid md:grid-cols-2 gap-3">
    <select aria-label="Jenis personel" className={inputCls} value={person.kind} onChange={e=>setPerson({...person,kind:e.target.value as 'PENGUJI'|'SAKSI'})}><option>PENGUJI</option><option>SAKSI</option></select>
    {(['nama','jabatan','email','telepon','nip'] as const).map(k=><input aria-label={k} key={k} className={inputCls} value={person[k]} placeholder={k} onChange={e=>setPerson({...person,[k]:e.target.value})}/>)}
    <button className={buttons} disabled={!person.nama||mutate.isPending} onClick={updatePerson}>Tambah personel</button>
   </div>}
  </div>}
  {tab==='audit'&&(admin||auditor)&&<div className={classes}>
   <h2 className="font-semibold mb-3">Audit trail (maks. 100 per halaman)</h2>
   <div className="space-y-2">{audit.map(x=><div key={x.id} className="border-b py-2 text-xs"><span className="font-semibold">{x.action}</span> · {x.entity_type} #{x.entity_id} · {new Date(x.occurred_at).toLocaleString('id-ID')} · actor #{x.actor_id}</div>)}</div>
  </div>}
 </div>;
}
