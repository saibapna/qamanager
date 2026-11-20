import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { templatesApi } from '@/api/templates';
import { api } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { FormField, inputCls } from '@/components/FormField';
import { Badge } from '@/components/Badge';

export function ValidatePage() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [output, setOutput] = useState('');
  const [result, setResult] = useState<{ ok: boolean; log: string } | null>(null);

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.list });
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', projectId], enabled: !!projectId,
    queryFn: () => templatesApi.listByProject(projectId!)
  });

  const mut = useMutation({
    mutationFn: () => api.post<{ ok: boolean; log: string }>(`/templates/${templateId}/validate`, { output }).then(r => r.data),
    onSuccess: setResult
  });

  return (
    <>
      <PageHeader title="Validasi 1=1" subtitle="Bandingkan output dengan fixture baseline" />
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-6">
          <FormField label="Project" required>
            <select value={projectId || ''} onChange={e => setProjectId(Number(e.target.value))} className={inputCls}>
              <option value="">— Pilih —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.kode}</option>)}
            </select>
          </FormField>
          <FormField label="Template" required>
            <select value={templateId || ''} onChange={e => setTemplateId(Number(e.target.value))} className={inputCls} disabled={!projectId}>
              <option value="">— Pilih —</option>
              {templates.filter(t => t.published).map(t => <option key={t.id} value={t.id}>v{t.versi}</option>)}
            </select>
          </FormField>
          <FormField label="Path PDF Output" required>
            <input value={output} onChange={e => setOutput(e.target.value)} className={inputCls} placeholder="output/ulo.pdf" />
          </FormField>
          <button onClick={() => mut.mutate()} disabled={!templateId || !output}
            className="w-full flex items-center justify-center gap-2 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            <ShieldCheck size={16} /> {mut.isPending ? 'Memvalidasi...' : 'Jalankan'}
          </button>
        </div>
        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between mb-4">
            <h3 className="font-semibold">Hasil</h3>
            {result && <Badge variant={result.ok ? 'success' : 'danger'}>{result.ok ? 'LULUS' : 'GAGAL'}</Badge>}
          </div>
          {!result ? <p className="text-sm text-slate-400">Belum ada hasil</p>
            : <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded-lg overflow-auto max-h-[400px] whitespace-pre-wrap">{result.log}</pre>}
        </div>
      </div>
    </>
  );
}
