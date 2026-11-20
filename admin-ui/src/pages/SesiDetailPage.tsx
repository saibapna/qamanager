import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Download, Plus, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { sesiApi, Item } from '@/api/sesi';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';

export function SesiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sid = Number(id);
  const toast = useToast();
  const { data: sesi, isLoading, refetch } = useQuery({ queryKey: ['sesi', sid], queryFn: () => sesiApi.get(sid) });
  const [items, setItems] = useState<Item[] | null>(null);
  const working = items ?? sesi?.items ?? [];

  const saveMut = useMutation({
    mutationFn: () => sesiApi.updateItems(sid, working),
    onSuccess: () => { toast.push('success', 'Tersimpan'); setItems(null); refetch(); },
    onError: (e: Error) => toast.push('error', e.message)
  });

  const pdfMut = useMutation({
    mutationFn: () => sesiApi.generatePdf(sid),
    onSuccess: (blob) => { const url = URL.createObjectURL(blob as any); window.open(url); toast.push('success', 'PDF generated'); },
    onError: (e: Error) => toast.push('error', e.message)
  });

  if (isLoading || !sesi) return <div>Memuat...</div>;

  const ringkasan = working.reduce((a, i) => { a.total++; if (i.status === 'PASS') a.lulus++; else if (i.status === 'FAIL') a.gagal++; else a.belum++; return a; }, { total: 0, lulus: 0, gagal: 0, belum: 0 });

  const update = (idx: number, patch: Partial<Item>) => {
    const next = [...working]; next[idx] = { ...next[idx], ...patch }; setItems(next);
  };

  return (
    <>
      <PageHeader title={`Sesi #${sesi.id}`} subtitle={`Status: ${sesi.status}`}
        actions={
          <>
            <button onClick={() => saveMut.mutate()} disabled={!items}
              className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <Save size={16} /> Simpan
            </button>
            <button onClick={() => pdfMut.mutate()}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700">
              <Download size={16} /> Generate PDF
            </button>
          </>
        } />
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[["Total", ringkasan.total], ["Lulus", ringkasan.lulus], ["Gagal", ringkasan.gagal], ["Belum", ringkasan.belum]].map(([l, v]) => (
          <div key={l as string} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500">{l}</p>
            <p className="text-2xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 w-20">No</th>
              <th className="text-left px-3 py-2 w-16">Kat</th>
              <th className="text-left px-3 py-2">Kebutuhan</th>
              <th className="text-left px-3 py-2">Hasil</th>
              <th className="text-left px-3 py-2 w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {working.map((it, idx) => (
              <tr key={idx} className="border-t">
                <td className="px-3 py-2"><input value={it.no} onChange={e => update(idx, { no: e.target.value })} className="w-full px-2 py-1 border rounded text-xs font-mono" /></td>
                <td className="px-3 py-2"><input value={it.kategori} onChange={e => update(idx, { kategori: e.target.value.toUpperCase() })} className="w-full px-2 py-1 border rounded text-xs" /></td>
                <td className="px-3 py-2"><textarea value={it.kebutuhan} onChange={e => update(idx, { kebutuhan: e.target.value })} rows={2} className="w-full px-2 py-1 border rounded text-xs" /></td>
                <td className="px-3 py-2"><textarea value={it.hasil} onChange={e => update(idx, { hasil: e.target.value })} rows={2} className="w-full px-2 py-1 border rounded text-xs" /></td>
                <td className="px-3 py-2">
                  <select value={it.status} onChange={e => update(idx, { status: e.target.value as any })} className="w-full px-2 py-1 border rounded text-xs">
                    <option>PASS</option><option>FAIL</option><option>BELUM</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
