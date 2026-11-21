import {useState} from 'react';
import {useParams,Link,useNavigate} from 'react-router-dom';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {FileCode2,ClipboardList,Plus} from 'lucide-react';
import {projectsApi} from '@/api/projects';
import {templatesApi} from '@/api/templates';
import {aplikasiApi,Aplikasi} from '@/api/aplikasi';
import {PageHeader} from '@/components/PageHeader';
import {Badge} from '@/components/Badge';
import {Modal} from '@/components/Modal';
import {inputCls,FormField} from '@/components/FormField';
import {useToast} from '@/components/Toast';
import {useAuth} from '@/store/authStore';
import {ProjectLivePanel} from '@/components/ProjectLivePanel';
import {formatDateIndonesia,formatTimestampWib,weekdayMismatch} from '@/lib/date';

function SesiList({app,templateId,canEdit}:{app:Aplikasi;templateId:number;canEdit:boolean}){
  const navigate=useNavigate();const qc=useQueryClient();const toast=useToast();
  const {data:sessions=[]}=useQuery({queryKey:['sessions',app.id],queryFn:()=>aplikasiApi.sessions(app.id),refetchInterval:15000});
  const create=useMutation({mutationFn:()=>aplikasiApi.createSession(app.id,{template_id:templateId,jenis:'Uji Layak Operasi (ULO)',tempat:'Pengujian daring'}),
    onSuccess:s=>{qc.invalidateQueries({queryKey:['sessions',app.id]});navigate(`/sesi/${s.id}`);},
    onError:(e:Error)=>toast.push('error',e.message)});
  return <div className="border rounded-xl bg-white p-4">
    <div className="flex items-center justify-between mb-2">
      <div><p className="font-semibold">{app.nama_singkat}</p><p className="text-xs text-slate-500">{app.nama_panjang}</p></div>
      {canEdit&&templateId>0&&<button className="text-xs bg-brand-600 text-white px-3 py-2 rounded" onClick={()=>create.mutate()} disabled={create.isPending}>+ Sesi ULO</button>}
    </div>
    {sessions.length===0?<p className="text-xs text-slate-600">Belum ada sesi</p>:
      sessions.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-sm">
        <div>
          <Link to={`/sesi/${s.id}`} className="hover:text-brand-600">Sesi #{s.id} · {s.status}</Link>
          <p className="text-xs text-slate-600">{s.tanggal ? 'Tanggal uji: '+formatDateIndonesia(s.tanggal) : 'Dibuat: '+formatTimestampWib(s.created_at)}</p>
          {weekdayMismatch(s.hari,s.tanggal)&&<p className="text-xs text-amber-800">Hari sumber perlu diverifikasi</p>}
        </div>
        {canEdit&&s.status==='DRAFT'&&<Link to={`/sesi/${s.id}#evidence-uji`}
          className="rounded border border-blue-700 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">
          Unggah bukti
        </Link>}
      </div>)}
  </div>;
}
export function ProjectDetailPage(){
  const {id}=useParams<{id:string}>();const pid=Number(id);const toast=useToast();const qc=useQueryClient();
  const canEdit=useAuth(s=>s.hasRole(pid,'ADMIN','TESTER'));
  const [open,setOpen]=useState(false);const [newApp,setNewApp]=useState({nama_singkat:'',nama_panjang:'',url:''});
  const {data:project}=useQuery({queryKey:['project',pid],queryFn:()=>projectsApi.get(pid)});
  const {data:templates=[]}=useQuery({queryKey:['templates',pid],queryFn:()=>templatesApi.listByProject(pid),refetchInterval:15000});
  const {data:apps=[]}=useQuery({queryKey:['aplikasi',pid],queryFn:()=>aplikasiApi.list(pid),refetchInterval:15000});
  const create=useMutation({mutationFn:()=>aplikasiApi.create(pid,newApp),onSuccess:()=>{
    qc.invalidateQueries({queryKey:['aplikasi',pid]});toast.push('success','Aplikasi dibuat');setOpen(false);setNewApp({nama_singkat:'',nama_panjang:'',url:''});
  },onError:(e:Error)=>toast.push('error',e.message)});
  if(!project)return <div>Memuat...</div>;
  const published=templates.find(t=>t.published);
  return <>
    <PageHeader title={project.nama} subtitle={`${project.kode} • ${project.instansi}`} actions={<Link to={`/projects/${pid}/manage`} className="px-3 py-2 bg-blue-700 text-white rounded text-sm">Kelola Project</Link>}/>
    <div className="grid grid-cols-2 gap-4 mb-6"><div className="bg-white rounded-xl border p-4"><FileCode2 className="text-brand-600 mb-2"/><p className="text-2xl font-bold">{templates.length}</p><p className="text-xs text-slate-500">Template</p></div>
    <div className="bg-white rounded-xl border p-4"><ClipboardList className="text-brand-600 mb-2"/><p className="text-2xl font-bold">{apps.length}</p><p className="text-xs text-slate-500">Aplikasi</p></div></div>
    <ProjectLivePanel projectId={pid}/>
    <h3 className="font-semibold mb-3">Templates</h3>
    <div className="bg-white rounded-xl border divide-y mb-8">{templates.map(t=><Link key={t.id} to={`/templates/${t.id}`} className="p-4 flex items-center justify-between hover:bg-slate-50">
      <div><p className="font-medium text-sm">{t.nama}</p><p className="text-xs text-slate-500">v{t.versi}</p></div>
      <Badge variant={t.published?'success':'warning'}>{t.published?'Published':'Draft'}</Badge></Link>)}</div>
    <div className="flex justify-between items-center mb-3"><h3 className="font-semibold">Aplikasi & Sesi ULO</h3>{canEdit&&<button onClick={()=>setOpen(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded"><Plus size={16}/> Aplikasi Baru</button>}</div>
    <div className="grid md:grid-cols-2 gap-4">{apps.map(app=><SesiList key={app.id} app={app} templateId={published?.id||0} canEdit={canEdit}/>)}</div>
    <Modal title="Aplikasi Baru" open={open} onClose={()=>setOpen(false)}><FormField label="Nama singkat" required><input value={newApp.nama_singkat} onChange={e=>setNewApp({...newApp,nama_singkat:e.target.value})} className={inputCls}/></FormField>
      <FormField label="Nama panjang"><input value={newApp.nama_panjang} onChange={e=>setNewApp({...newApp,nama_panjang:e.target.value})} className={inputCls}/></FormField>
      <FormField label="URL"><input value={newApp.url} onChange={e=>setNewApp({...newApp,url:e.target.value})} className={inputCls}/></FormField>
      <button className="px-3 py-2 bg-brand-600 text-white rounded" disabled={!newApp.nama_singkat||create.isPending} onClick={()=>create.mutate()}>Simpan</button></Modal>
  </>;
}
