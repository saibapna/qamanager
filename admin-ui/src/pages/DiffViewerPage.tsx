import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { FormField, inputCls } from '@/components/FormField';
import { Badge } from '@/components/Badge';
import {SecureImage} from '@/components/SecureImage';

interface DP { page: number; ssim?: number; ok?: boolean; refUrl?: string; outUrl?: string; heatmapUrl?: string; }
interface DR { allPass: boolean; pages: DP[]; }

export function DiffViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [outputPath, setOutputPath] = useState('');
  const [result, setResult] = useState<DR | null>(null);
  const [active, setActive] = useState(1);

  const mut = useMutation({
    mutationFn: () => api.post<DR>(`/templates/${id}/diff`, { outputPath }).then(r => r.data),
    onSuccess: r => { setResult(r); setActive(1); }
  });

  const page = result?.pages.find(p => p.page === active);

  return (
    <>
      <PageHeader title="Diff Viewer" subtitle="Visual regression per halaman" />
      <div className="bg-white rounded-xl border p-4 mb-6">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <FormField label="Path PDF Output" required>
              <input value={outputPath} onChange={e => setOutputPath(e.target.value)} className={inputCls} />
            </FormField>
          </div>
          <button onClick={() => mut.mutate()} disabled={!outputPath || mut.isPending}
            className="px-4 py-2 mb-4 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {mut.isPending ? 'Menghitung...' : 'Bandingkan'}
          </button>
        </div>
      </div>
      {mut.isError && <p className="text-red-600 text-sm mb-4">{mut.error.message}</p>}
      {result && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {result.pages.map(p => (
              <button key={p.page} onClick={() => setActive(p.page)}
                className={`px-3 py-1.5 rounded text-sm ${active === p.page ? 'bg-brand-600 text-white' : p.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                Hal {p.page} {p.ssim !== undefined && <span className="ml-1 text-xs opacity-75">{p.ssim.toFixed(4)}</span>}
              </button>
            ))}
          </div>
          {page?.ok !== undefined && <Badge variant={page.ok ? 'success' : 'danger'}>{page.ok ? 'IDENTIK' : 'BERBEDA'}</Badge>}
          {page && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div><p className="text-xs font-medium text-slate-500 mb-1">Referensi</p><SecureImage src={page.refUrl} alt="PDF referensi" /></div>
              <div><p className="text-xs font-medium text-slate-500 mb-1">Output</p><SecureImage src={page.outUrl} alt="PDF keluaran" /></div>
              <div><p className="text-xs font-medium text-slate-500 mb-1">Heatmap</p><SecureImage src={page.heatmapUrl} alt="Heatmap perbedaan" /></div>
            </div>
          )}
        </>
      )}
    </>
  );
}
