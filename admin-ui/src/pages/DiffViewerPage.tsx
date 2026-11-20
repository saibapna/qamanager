import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { FormField, inputCls } from '@/components/FormField';
import { Badge } from '@/components/Badge';

interface DP { page: number; ok: boolean; }
interface DR {
  allPass: boolean;
  method: string;
  description: string;
  pages: DP[];
  baselineUrl: string;
  outputUrl: string;
}

export function DiffViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [outputPath, setOutputPath] = useState('');
  const [result, setResult] = useState<DR | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => api.post<DR>(`/templates/${id}/diff`, { outputPath }).then(r => r.data),
    onSuccess: r => { setResult(r); setError(null); },
    onError: (e: Error) => { setResult(null); setError(e.message); }
  });

  const download = async (route: string, filename: string) => {
    if (!route.startsWith('/api/')) return;
    try {
      const response = await api.get<Blob>(route.replace(/^\/api/, ''), { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal mengunduh PDF'); }
  };

  return (
    <>
      <PageHeader title="Perbandingan PDF" subtitle="Verifikasi kesamaan berkas (SHA-256), bukan diff visual SSIM" />
      <div className="bg-white rounded-xl border p-5 mb-6">
        <p className="mb-4 text-sm text-slate-600">
          Masukkan path output PDF dari halaman sesi ULO. Unggah PDF baseline di halaman template terlebih dahulu.
          Perbedaan hash tidak selalu menunjukkan perbedaan visual.
        </p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <FormField label="Path PDF Output" required>
              <input value={outputPath} onChange={e => setOutputPath(e.target.value)} className={inputCls}
                placeholder="output/project-1/sesi-1-v1.pdf" />
            </FormField>
          </div>
          <button onClick={() => mut.mutate()} disabled={!outputPath || mut.isPending}
            className="px-4 py-2 mb-4 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {mut.isPending ? 'Menghitung...' : 'Bandingkan'}
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-red-700 text-sm mb-4">{error}</p>}
      {result && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={result.allPass ? 'success' : 'danger'}>{result.allPass ? 'IDENTIK' : 'BERBEDA'}</Badge>
            <p className="text-sm text-slate-700">{result.description}</p>
          </div>
          <div className="flex gap-4">
            <button className="flex items-center gap-2 text-blue-700 hover:underline text-sm"
              onClick={() => download(result.baselineUrl, 'baseline.pdf')}><Download size={16}/> Unduh baseline</button>
            <button className="flex items-center gap-2 text-blue-700 hover:underline text-sm"
              onClick={() => download(result.outputUrl, 'hasil-ulo.pdf')}><Download size={16}/> Unduh output</button>
          </div>
          <p className="text-xs text-slate-500">
            {result.pages.length} halaman ditinjau berdasarkan identitas berkas. Preview halaman, SSIM, dan heatmap
            belum didukung tanpa renderer PDF visual yang terpisah.
          </p>
        </div>
      )}
    </>
  );
}
