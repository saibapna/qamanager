import { useState } from 'react';
import { useAuth } from '@/store/authStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ExternalLink } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { FormField, inputCls } from '@/components/FormField';
import { Badge } from '@/components/Badge';
import { useToast } from '@/components/Toast';

export function ProjectsPage() {
  const nav = useNavigate();
  const isPlatformAdmin=useAuth(s=>!!s.user?.is_platform_admin);
  const projectRoles=useAuth(s=>s.user?.projects||[]);
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kode: '', nama: '', instansi: '', bidang: '' });

  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list, refetchInterval: 15000 });
  const { data: portfolio = [], isError: portfolioError } = useQuery({
    queryKey: ['portfolio'],
    queryFn: projectsApi.portfolio,
    refetchInterval: 15000
  });
  const totals = portfolio.reduce((acc, row) => ({
    sessions: acc.sessions + row.total_sessions,
    pass: acc.pass + row.pass_items,
    fail: acc.fail + row.fail_items,
    remaining: acc.remaining + row.pending_items,
    defects: acc.defects + row.open_defects,
    witness: acc.witness + row.awaiting_witness,
    approver: acc.approver + row.awaiting_approver,
    rejected: acc.rejected + row.rejected_decisions
  }), {sessions:0,pass:0,fail:0,remaining:0,defects:0,witness:0,approver:0,rejected:0});
  const progress = new Map(portfolio.map(row => [row.id,row]));


  const createMut = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.push('success', 'Project dibuat'); setOpen(false); setForm({ kode: '', nama: '', instansi: '', bidang: '' }); },
    onError: (e: Error) => toast.push('error', e.message)
  });

  const deleteMut = useMutation({
    mutationFn: projectsApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.push('success', 'Project diarsipkan'); },
    onError: (e: Error) => toast.push('error', e.message)
  });

  return (
    <>
      <PageHeader title="Projects" subtitle="Kelola project ULO/UAT"
        actions={isPlatformAdmin?<button onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700">
          <Plus size={16} /> Project Baru
        </button>:undefined} />
      <section aria-label="Ringkasan UAT lintas project" className="mb-5">
        <h2 className="text-sm font-semibold mb-2">Ringkasan semua project yang dapat Anda akses</h2>
        {portfolioError && <p role="alert" className="text-sm text-red-700 mb-2">Gagal memuat ringkasan lintas project. Data tabel project tetap tersedia.</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([['Sesi UAT',totals.sessions],['PASS',totals.pass],['FAIL',totals.fail],['BELUM',totals.remaining],['Defect aktif',totals.defects],['Menunggu saksi',totals.witness],['Menunggu approver',totals.approver],['Riwayat penolakan',totals.rejected]] as const).map(([label,value])=>
            <div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="font-semibold text-2xl">{value}</p></div>)}
        </div>
      </section>
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">Kode</th>
              <th className="text-left px-4 py-3">Nama</th>
              <th className="text-left px-4 py-3">Instansi</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Progres UAT</th>
              <th className="text-right px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Memuat...</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada project</td></tr>
            ) : projects.map(p => (
              <tr key={p.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{p.kode}</td>
                <td className="px-4 py-3">{p.nama}</td>
                <td className="px-4 py-3 text-slate-500">{p.instansi}</td>
                <td className="px-4 py-3">
                  <Badge variant={p.aktif ? 'success' : 'neutral'}>{p.aktif ? 'Aktif' : 'Nonaktif'}</Badge>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {progress.has(p.id) ? <span>
                    {progress.get(p.id)?.pass_items}/{progress.get(p.id)?.total_items} PASS
                    <span className="block">{progress.get(p.id)?.open_defects} defect aktif</span>
                    <span className="block">{progress.get(p.id)?.awaiting_witness} menunggu saksi · {progress.get(p.id)?.awaiting_approver} menunggu approver</span>
                  </span> : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => nav(`/projects/${p.id}`)} aria-label={`Buka project ${p.nama}`} className="p-1.5 hover:bg-blue-50 rounded text-blue-600 mr-1">
                    <ExternalLink size={16} />
                  </button>
                  {projectRoles.some(x=>x.project_id===p.id&&x.role==='ADMIN')&&<button onClick={() => confirm(`Arsipkan ${p.nama}?`) && deleteMut.mutate(p.id)} aria-label={`Arsipkan project ${p.nama}`}
                    className="p-1.5 hover:bg-red-50 rounded text-red-600">
                    <Trash2 size={16} />
                  </button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Project Baru">
        <FormField label="Kode" required>
          <input value={form.kode} onChange={e => setForm({ ...form, kode: e.target.value })} className={inputCls} placeholder="SIRIKAP" />
        </FormField>
        <FormField label="Nama" required>
          <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} className={inputCls} />
        </FormField>
        <FormField label="Instansi" required>
          <input value={form.instansi} onChange={e => setForm({ ...form, instansi: e.target.value })} className={inputCls} />
        </FormField>
        <FormField label="Bidang">
          <input value={form.bidang} onChange={e => setForm({ ...form, bidang: e.target.value })} className={inputCls} />
        </FormField>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Batal</button>
          <button onClick={() => createMut.mutate(form)} disabled={createMut.isPending}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {createMut.isPending ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </Modal>
    </>
  );
}