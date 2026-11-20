import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth, Role } from '@/store/authStore';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';

type Member={id:number;email:string;nama:string;role:Role;aktif:boolean};
type Person={id:number;kind:'PENGUJI'|'SAKSI';nama:string;jabatan:string|null;email:string|null;telepon:string|null;nip:string|null;aktif:boolean};
type Item={no:string;kategori:string;kebutuhan:string;urutan:number;gate_required:boolean};
type Audit={id:number;action:string;entity_type:string;entity_id:number;actor_id:number;occurred_at:string;metadata:unknown};
type Dashboard={sessions:{total:number;drafts:number;finals:number;signed:number};items:{total:number;pass:number;fail:number;belum:number};defects:{total:number;unresolved:number}};
const input='w-full rounded border px-3 py-2 text-sm';
const btn='rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50';
const roleOptions:Role[]=['ADMIN','TESTER','WITNESS','APPROVER','AUDITOR'];
export function ProjectOpsPage(){
  const {id}=useParams<{id:string}>(),pid=Number(id);
  const qc=useQueryClient(),toast=useToast();
  const admin=useAuth(s=>s.hasRole(pid,'ADMIN'));
  const reader=useAuth(s=>s.hasRole(pid,'ADMIN','AUDITOR'));
  const canEditPeople=useAuth(s=>s.hasRole(pid,'ADMIN','TESTER'));
  const [section,setSection]=useState<'dashboard'|'members'|'people'|'plan'|'audit'>('dashboard');
  const [member,setMember]=useState<{nama:string;email:string;password:string;role:Role}>({nama:'',email:'',password:'',role:'TESTER'});
  const [person,setPerson]=useState({kind:'PENGUJI' as 'PENGUJI'|'SAKSI',nama:'',jabatan:'',email:'',telepon:'',nip:''});
  const [editingPerson,setEditingPerson]=useState<number|null>(null);
  const [planSearch,setPlanSearch]=useState('');
  const [planJson,setPlanJson]=useState('');
  const [offset,setOffset]=useState(0);
  const {data:dashboard}=useQuery({queryKey:['project-dashboard',pid],queryFn:()=>api.get<Dashboard>('/projects/'+pid+'/dashboard').then(r=>r.data)});
  const {data:members=[]}=useQuery({queryKey:['members',pid],queryFn:()=>api.get<Member[]>('/projects/'+pid+'/members').then(r=>r.data),enabled:reader});
  const {data:people=[]}=useQuery({queryKey:['people',pid],queryFn:()=>api.get<Person[]>('/projects/'+pid+'/people').then(r=>r.data)});
  const {data:plan=[]}=useQuery({queryKey:['plan',pid],queryFn:()=>api.get<Item[]>('/projects/'+pid+'/plan').then(r=>r.data)});
  const {data:audit=[]}=useQuery({queryKey:['audit',pid,offset],queryFn:()=>api.get<Audit[]>('/projects/'+pid+'/audit?offset='+offset).then(r=>r.data),enabled:reader&&section==='audit'});
  const addMember=useMutation({
    mutationFn:()=>api.post('/projects/'+pid+'/members',member),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['members',pid]});toast.push('success','Anggota disimpan');setMember({nama:'',email:'',password:'',role:'TESTER'});},
    onError:(e:Error)=>toast.push('error',e.message)
  });
  const removeMember=useMutation({
    mutationFn:(userId:number)=>api.delete('/projects/'+pid+'/members/'+userId),
    onSuccess:()=>qc.invalidateQueries({queryKey:['members',pid]}),
    onError:(e:Error)=>toast.push('error',e.message)
  });
  const addPerson=useMutation({
    mutationFn:()=>editingPerson!==null?api.patch('/projects/'+pid+'/people/'+editingPerson,person):api.post('/projects/'+pid+'/people',person),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['people',pid]});toast.push('success','Penguji/saksi disimpan');setPerson({kind:'PENGUJI',nama:'',jabatan:'',email:'',telepon:'',nip:''});setEditingPerson(null);},
    onError:(e:Error)=>toast.push('error',e.message)
  });
  const changeMemberRole=useMutation({
    mutationFn:({m,role}:{m:Member;role:Role})=>api.post('/projects/'+pid+'/members',{email:m.email,nama:m.nama,role}),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['members',pid]});toast.push('success','Role anggota diperbarui')},
    onError:(e:Error)=>toast.push('error',e.message)
  });
  const togglePerson=useMutation({
    mutationFn:(p:Person)=>api.patch('/projects/'+pid+'/people/'+p.id,{aktif:!p.aktif}),
    onSuccess:()=>qc.invalidateQueries({queryKey:['people',pid]}),
    onError:(e:Error)=>toast.push('error',e.message)
  });
  const savePlan=useMutation({
    mutationFn:()=>{
      const rows=JSON.parse(planJson) as Item[];
      if(!Array.isArray(rows))throw new Error('Isi JSON harus array test case');
      return api.put('/projects/'+pid+'/plan',{items:rows});
    },
    onSuccess:()=>{qc.invalidateQueries({queryKey:['plan',pid]});toast.push('success','Test plan disimpan');setPlanJson('');},
    onError:(e:Error)=>toast.push('error',e.message)
  });
  return <div className="max-w-6xl">
    <PageHeader title="Pengelolaan Project" subtitle={'Project #'+pid+' — dashboard, anggota, penguji/saksi, test plan dan audit'}/>
    <Link to={'/projects/'+pid} className="text-sm underline text-blue-700">Kembali ke detail project</Link>
    <nav className="flex flex-wrap gap-2 my-5" aria-label="Modul pengelolaan">
      {(['dashboard','members','people','plan','audit'] as const).filter(s=>s!=='audit'||reader).filter(s=>s!=='members'||reader).map(s=>
        <button key={s} type="button" onClick={()=>setSection(s)} aria-pressed={section===s}
          className={'px-3 py-2 rounded text-sm border '+(section===s?'bg-blue-700 text-white':'bg-white')}>{({dashboard:'Dashboard',members:'Anggota & Role',people:'Penguji & Saksi',plan:'Test Plan',audit:'Audit Trail'})[s]}</button>
      )}
    </nav>
    {section==='dashboard'&&<section className="grid gap-4 md:grid-cols-3">
      {[
        ['Total Sesi',dashboard?.sessions.total||0],['Draft',dashboard?.sessions.drafts||0],['Final',dashboard?.sessions.finals||0],
        ['Signed',dashboard?.sessions.signed||0],['PASS',dashboard?.items.pass||0],['FAIL',dashboard?.items.fail||0],
        ['BELUM',dashboard?.items.belum||0],['Defect',dashboard?.defects.total||0],['Defect Belum Selesai',dashboard?.defects.unresolved||0]
      ].map(([label,value])=><div className="rounded-xl bg-white border p-5" key={String(label)}><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>)}
    </section>}
    {section==='members'&&reader&&<section className="rounded-xl bg-white border p-5 space-y-5">
      <h2 className="font-semibold">Keanggotaan & RBAC</h2>
      <p className="text-sm text-slate-600">ADMIN mengelola anggota. User baru membutuhkan password minimal 16 karakter; user lama cukup diisi email dan nama.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th>Nama</th><th>Email</th><th>Role</th><th>Aksi</th></tr></thead>
        <tbody>{members.map(m=><tr className="border-b" key={m.id}><td className="p-2">{m.nama}</td><td className="p-2">{m.email}</td><td className="p-2">{m.role}</td><td className="p-2">
          {admin&&<div className="flex items-center gap-2"><select className="rounded border p-1 text-xs" aria-label={'Ubah role '+m.email}
            value={m.role} disabled={changeMemberRole.isPending}
            onChange={e=>{const next=e.target.value as Role;if(window.confirm('Ubah role '+m.email+' menjadi '+next+'?'))changeMemberRole.mutate({m,role:next})}}>
            {roleOptions.map(r=><option key={r}>{r}</option>)}
          </select><button className="text-red-700 underline" onClick={()=>{if(window.confirm('Cabut akses '+m.email+'?'))removeMember.mutate(m.id)}}>Cabut</button></div>}
        </td></tr>)}</tbody></table></div>
      {admin&&<form onSubmit={e=>{e.preventDefault();addMember.mutate()}} className="grid md:grid-cols-2 gap-3">
        <label className="text-sm">Nama<input aria-label="Nama anggota" required value={member.nama} onChange={e=>setMember({...member,nama:e.target.value})} className={input}/></label>
        <label className="text-sm">Email<input type="email" required value={member.email} onChange={e=>setMember({...member,email:e.target.value})} className={input}/></label>
        <label className="text-sm">Password (khusus user baru)<input type="password" autoComplete="new-password" value={member.password} onChange={e=>setMember({...member,password:e.target.value})} className={input}/></label>
        <label className="text-sm">Role<select value={member.role} onChange={e=>setMember({...member,role:e.target.value as Role})} className={input}>{roleOptions.map(r=><option key={r}>{r}</option>)}</select></label>
        <button className={btn} disabled={addMember.isPending}>Simpan anggota</button>
      </form>}
    </section>}
    {section==='people'&&<section className="rounded-xl bg-white border p-5 space-y-4">
      <h2 className="font-semibold">Master Penguji dan Saksi</h2>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b"><th>Jenis</th><th>Nama</th><th>Jabatan</th><th>Email</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>{people.map(p=><tr key={p.id} className="border-b"><td className="p-2">{p.kind}</td><td className="p-2">{p.nama}</td><td className="p-2">{p.jabatan||'--'}</td><td className="p-2">{p.email||'--'}</td><td className="p-2">{p.aktif?'Aktif':'Nonaktif'}</td><td className="p-2 whitespace-nowrap">
          {canEditPeople&&<><button className="text-blue-700 underline mr-2" onClick={()=>{setEditingPerson(p.id);setPerson({kind:p.kind,nama:p.nama,jabatan:p.jabatan||'',email:p.email||'',telepon:p.telepon||'',nip:p.nip||''})}}>Edit</button>
          <button className="text-red-700 underline" onClick={()=>{if(window.confirm((p.aktif?'Nonaktifkan':'Aktifkan')+' '+p.nama+'?'))togglePerson.mutate(p)}}>{p.aktif?'Nonaktifkan':'Aktifkan'}</button></>}</td></tr>)}</tbody></table></div>
      {canEditPeople&&<form onSubmit={e=>{e.preventDefault();addPerson.mutate()}} className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">Jenis<select className={input} value={person.kind} onChange={e=>setPerson({...person,kind:e.target.value as 'PENGUJI'|'SAKSI'})}><option>PENGUJI</option><option>SAKSI</option></select></label>
        {(['nama','jabatan','email','telepon','nip'] as const).map(k=><label className="text-sm" key={k}>{k}<input className={input} required={k==='nama'} value={person[k]} onChange={e=>setPerson({...person,[k]:e.target.value})}/></label>)}
        <button className={btn} disabled={addPerson.isPending}>{editingPerson!==null?'Simpan perubahan':'Tambah penguji/saksi'}</button>
        {editingPerson!==null&&<button type="button" className="rounded border p-2 text-sm" onClick={()=>{setEditingPerson(null);setPerson({kind:'PENGUJI',nama:'',jabatan:'',email:'',telepon:'',nip:''})}}>Batal edit</button>}
      </form>}
    </section>}
    {section==='plan'&&<section className="rounded-xl bg-white border p-5 space-y-4">
      <h2 className="font-semibold">Test Plan Kanonis ({plan.length} item)</h2>
      <p className="text-sm text-slate-600">Test plan terkunci setelah project memiliki sesi UAT. Saat sesi baru dibuat, semua item akan disalin dan tidak boleh dihapus atau diubah identitasnya.</p>
      <label className="block text-sm">Cari test case<input value={planSearch} onChange={e=>setPlanSearch(e.target.value)}
        className={input} placeholder="Nomor, kategori, kebutuhan"/></label>
      <div className="max-h-96 overflow-auto border rounded"><table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr className="border-b"><th>No</th><th>Kategori</th><th>Kebutuhan</th><th>Urutan</th><th>Gate</th></tr></thead>
        <tbody>{plan.filter(t=>[t.no,t.kategori,t.kebutuhan].some(v=>v.toLowerCase().includes(planSearch.toLowerCase()))).map(t=><tr key={t.no} className="border-b"><td className="p-2">{t.no}</td><td className="p-2">{t.kategori}</td><td className="p-2">{t.kebutuhan}</td><td className="p-2">{t.urutan}</td><td className="p-2">{t.gate_required?'Wajib':'—'}</td></tr>)}</tbody></table></div>
      {admin&&(dashboard?.sessions.total||0)===0&&<div><label className="block text-sm mb-2">Tempel JSON array item: no, kategori, kebutuhan, urutan dan gate_required</label>
        <button type="button" className="rounded border px-3 py-2 mb-2 text-sm" onClick={()=>setPlanJson(JSON.stringify(plan,null,2))}>Muat test plan ke editor</button>
        <textarea className={input} rows={7} value={planJson} onChange={e=>setPlanJson(e.target.value)} placeholder='[{"no":"A1","kategori":"A","kebutuhan":"Login","urutan":1,"gate_required":false}]'/>
        <button className={btn} disabled={!planJson||savePlan.isPending} onClick={()=>savePlan.mutate()}>Simpan test plan</button>
      </div>}
    </section>}
    {section==='audit'&&reader&&<section className="rounded-xl bg-white border p-5">
      <h2 className="font-semibold mb-3">Riwayat Audit Append-only</h2>
      {audit.map(a=><div key={a.id} className="border-b py-3 text-sm"><b>{a.action}</b> · {a.entity_type} #{a.entity_id} · actor #{a.actor_id}
        <p className="text-slate-500">{new Date(a.occurred_at).toLocaleString('id-ID')}</p></div>)}
      <div className="flex gap-3 mt-4"><button className={btn} disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>Sebelumnya</button>
        <button className={btn} disabled={audit.length<100} onClick={()=>setOffset(offset+100)}>Berikutnya</button></div>
    </section>}
  </div>;
}