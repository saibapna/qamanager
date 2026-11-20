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
  const qc = useQueryClient();
  const toast = useToast();
  const isPlatformAdmin=useAuth(s=>Boolean(s.user?.is_platform_admin));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kode: '', nama: '', instansi: '', bidang: '' });

  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list });

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
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3">Kode</th>
              <th className="text-left px-4 py-3">Nama</th>
              <th className="text-left px-4 py-3">Instansi</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Memuat...</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada project</td></tr>
            ) : projects.map(p => (
              <tr key={p.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{p.kode}</td>
                <td className="px-4 py-3">{p.nama}</td>
                <td className="px-4 py-3 text-slate-500">{p.instansi}</td>
                <td className="px-4 py-3">
                  <Badge variant={p.aktif ? 'success' : 'neutral'}>{p.aktif ? 'Aktif' : 'Nonaktif'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => nav(`/projects/${p.id}`)} className="p-1.5 hover:bg-blue-50 rounded text-blue-600 mr-1">
                    <ExternalLink size={16} />
                  </button>
                  <button onClick={() => confirm(`Hapus ${p.nama}?`) && deleteMut.mutate(p.id)}
                    className="p-1.5 hover:bg-red-50 rounded text-red-600">
                    <Trash2 size={16} />
                  </button>
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
