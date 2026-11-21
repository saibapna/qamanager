import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Download, Eye, Plus, Save, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { UatWorkflowPanel } from '@/components/UatWorkflowPanel';
import { useAuth } from '@/store/authStore';
import { useProjectLive } from '@/lib/useProjectLive';
import { sesiApi, Item, PdfPreviewToken } from '@/api/sesi';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { formatDateIndonesia, formatTimestampWib, formatPukulWib, weekdayIndonesia, weekdayMismatch } from '@/lib/date';

export function SesiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const sid = Number(id);
  const sidRef = useRef(sid);
  sidRef.current = sid;
  const [preview, setPreview] = useState<{
    sessionId:number; url:string; revision:number; status:string; htmlSha256:string; pages:number;
  } | null>(null);
  useEffect(() => { setPreview(null); }, [sid]);
  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);
  const toast = useToast();
  const [search,setSearch] = useState('');
  const [statusFilter,setStatusFilter] = useState('ALL');
  const [selectedEvidenceItemId,setSelectedEvidenceItemId] = useState<number|undefined>(undefined);
  const [page,setPage] = useState(1);
  const pageSize=20;
  const user = useAuth(s=>s.user);
  const { data: sesi, isLoading, refetch } = useQuery({ queryKey: ['sesi', sid], queryFn: () => sesiApi.get(sid), refetchInterval: 15000 });
  useEffect(()=>{setSelectedEvidenceItemId(undefined)},[sid]);
  useEffect(()=>{
    if(!sesi || window.location.hash !== '#evidence-uji')return;
    const frame=window.requestAnimationFrame(()=>document.getElementById('evidence-uji')?.scrollIntoView({block:'start'}));
    return ()=>window.cancelAnimationFrame(frame);
  },[sesi?.id]);
  const { connected, online } = useProjectLive(Number(sesi?.project_id || 0), sid);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const {data:outputs=[],refetch:refetchOutputs}=useQuery({queryKey:['outputs',sid],queryFn:()=>sesiApi.outputs(sid)});
  const working = items ?? sesi?.items ?? [];
  const staleDraft = items !== null && draftRevision !== null && sesi !== undefined && draftRevision !== Number(sesi.revision??0);
  const role = user?.projects.find(p=>p.project_id === sesi?.project_id)?.role;
  const canEdit = ['ADMIN','TESTER'].includes(role||'');
  const previewStale = !!preview && (
    preview.sessionId !== sid || preview.revision !== Number(sesi?.revision) ||
    preview.status !== sesi?.status || items !== null || conflict
  );
  const visibleItems = working.map((it,idx)=>({...it,idx})).filter(it => (statusFilter==='ALL'||it.status===statusFilter) && (!search.trim() || [it.no,it.kebutuhan,it.hasil].some(t=>String(t||'').toLowerCase().includes(search.toLowerCase()))));
  const totalPages=Math.max(1,Math.ceil(visibleItems.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const currentItems=visibleItems.slice((safePage-1)*pageSize,safePage*pageSize);

  const saveMut = useMutation({
    mutationFn: () => sesiApi.updateItems(sid, working, draftRevision ?? Number(sesi?.revision ?? -1)),
    onSuccess: () => { toast.push('success', 'Tersimpan'); setItems(null); setDraftRevision(null); setConflict(false); refetch(); },
    onError: (e: Error) => { if (e.message.includes('diubah pengguna lain') || e.message.includes('409')) setConflict(true); toast.push('error', e.message); }
  });

  const previewMut = useMutation({
    mutationFn: (sessionId: number) => sesiApi.previewPdf(sessionId),
    onSuccess: (result, sessionId) => {
      // Do not reveal a PDF from the previous route if navigation happened in flight.
      if (sidRef.current !== sessionId) return;
      setPreview({
        sessionId, url: URL.createObjectURL(result.blob),
        revision: result.sourceRevision, status: result.sourceStatus,
        htmlSha256: result.sourceHtmlSha256, pages: result.pageCount
      });
    },
    onError: (e: Error) => toast.push('error', e.message)
  });
  const pdfMut = useMutation({
    mutationFn: (p: {sessionId:number; revision:number; status:string; htmlSha256:string}) => {
      const token: PdfPreviewToken = {
        expected_revision:p.revision, expected_status:p.status, preview_html_sha256:p.htmlSha256
      };
      return sesiApi.generatePdf(p.sessionId, token);
    },
    onSuccess: (blob, p) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'ulo-sesi-' + p.sessionId + '.pdf'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (sidRef.current === p.sessionId) { setPreview(null); refetchOutputs(); }
      toast.push('success', 'PDF berhasil dibuat dan disimpan');
    },
    onError: (e: Error) => toast.push('error', e.message)
  });

  const finalizeMut=useMutation({mutationFn:()=>sesiApi.finalize(sid),onSuccess:()=>{toast.push('success','Sesi final');refetch();},onError:(e:Error)=>toast.push('error',e.message)});
  const reopenMut=useMutation({mutationFn:()=>sesiApi.reopen(sid),onSuccess:()=>{toast.push('success','Sesi kembali menjadi DRAFT; semua keputusan lama tersimpan sebagai riwayat');refetch();},onError:(e:Error)=>toast.push('error',e.message)});
  const downloadOutput = async (outputId: number, versi: number) => {
    try {
      const blob = await sesiApi.downloadOutput(sid, outputId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'ulo-sesi-' + sid + '-v' + versi + '.pdf'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { toast.push('error', e instanceof Error ? e.message : 'Gagal mengunduh PDF'); }
  };
  if (isLoading || !sesi) return <div>Memuat...</div>;

  const ringkasan = working.reduce((a, i) => { a.total++; if (i.status === 'PASS') a.lulus++; else if (i.status === 'FAIL') a.gagal++; else a.belum++; return a; }, { total: 0, lulus: 0, gagal: 0, belum: 0 });

  const update = (idx: number, patch: Partial<Item>) => {
    const next = [...working]; next[idx] = { ...next[idx], ...patch }; if(items===null) setDraftRevision(Number(sesi.revision??0)); setItems(next);
  };

  return (
    <>
      <PageHeader title={`Sesi #${sesi.id}`} subtitle={`Status: ${sesi.status}`}
        actions={
          <>
            <a href="#evidence-uji" className="inline-flex items-center gap-2 rounded-lg border border-blue-700 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
              <Upload size={16} /> {canEdit&&sesi.status==='DRAFT'?'Unggah bukti':'Lihat bukti'}
            </a>
            <button onClick={() => saveMut.mutate()} disabled={!items || staleDraft || conflict || saveMut.isPending || sesi.status !== 'DRAFT' || !canEdit}
              className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <Save size={16} /> Simpan
            </button>
            {sesi.status==='DRAFT'&&['ADMIN','APPROVER'].includes(role||'')&&<button onClick={() => finalizeMut.mutate()} disabled={finalizeMut.isPending || !!items} className="px-3 py-2 text-sm border rounded-lg disabled:opacity-50">Finalisasi</button>}
            {sesi.status==='FINAL'&&role==='ADMIN'&&<button onClick={() => {if(window.confirm('Buka ulang sesi FINAL? Revisi baru wajib difinalisasi dan disetujui ulang.'))reopenMut.mutate()}} disabled={reopenMut.isPending} className="px-3 py-2 text-sm border rounded-lg disabled:opacity-50">Buka Ulang</button>}
            {canEdit&&<button type="button" onClick={() => previewMut.mutate(sid)}
              disabled={previewMut.isPending || pdfMut.isPending || !!items || staleDraft || conflict || saveMut.isPending}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
              <Eye size={16} /> {previewMut.isPending ? 'Menyiapkan pratinjau...' : 'Pratinjau PDF'}
            </button>}
          </>
        } />
      <section aria-label="Tanggal dan waktu pengujian" className="mb-4 rounded-xl border bg-white p-4 text-sm space-y-1">
        <p><span className="font-semibold">Tanggal pengujian:</span> <time dateTime={sesi.tanggal||undefined}>{formatDateIndonesia(sesi.tanggal)}</time>{sesi.pukul ? ' · ' + formatPukulWib(sesi.pukul) : ''}</p>
        {sesi.hari && <p className="text-slate-600">Hari pada dokumen: {sesi.hari}</p>}
        <p className="text-slate-600">Dicatat dalam sistem: {formatTimestampWib(sesi.created_at)}</p>
        {weekdayMismatch(sesi.hari,sesi.tanggal)&&
          <p role="alert" className="mt-2 rounded border border-amber-400 bg-amber-50 p-2 text-amber-900">
            Hari dalam dokumen ({sesi.hari}) tidak sesuai kalender ({weekdayIndonesia(sesi.tanggal)}, {formatDateIndonesia(sesi.tanggal)}). Periksa sumber; data historis tidak diubah otomatis.
          </p>}
      </section>
      <div className="mb-3 text-xs text-slate-600">{connected ? '● Real-time tersambung' : '● Sinkronisasi berkala 15 detik'}{connected && <span className="ml-3">{online.filter(u=>u.sessionId===sid).length} pengguna di sesi ini</span>}</div>
      {items !== null && canEdit && <p className="mb-3 text-xs text-amber-800" role="status">
        Simpan perubahan test case sebelum membuka pratinjau PDF agar sesuai dengan data server.
      </p>}
      {(staleDraft || conflict) && <div role="alert" className="mb-3 rounded border border-amber-400 bg-amber-50 p-3 text-sm">Sesi berubah di pengguna lain. Draft Anda tidak ditimpa. <button type="button" className="ml-2 underline" onClick={()=>{setItems(null);setDraftRevision(null);setConflict(false);void refetch();}}>Buang draft dan muat ulang</button></div>}
      {sesi.status==='FINAL'&&!sesi.finalized_at&&<p role="alert" className="mb-4 rounded border border-amber-400 p-3 text-sm text-amber-900">Sesi FINAL dari versi lama belum lulus pemeriksaan workflow. ADMIN harus buka ulang, lengkapi defect/retest, lalu finalisasi ulang sebelum proses persetujuan.</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[["Total", ringkasan.total], ["Lulus", ringkasan.lulus], ["Gagal", ringkasan.gagal], ["Belum", ringkasan.belum]].map(([l, v]) => (
          <div key={l as string} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-slate-500">{l}</p>
            <p className="text-2xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      {outputs.length>0&&<div className="bg-white rounded-xl border p-4 mb-6">
        <p className="font-semibold text-sm mb-2">Riwayat PDF — path dapat digunakan untuk perbandingan fixture</p>
        {outputs.map(o=><div key={o.id} className="flex items-center justify-between gap-3 py-1">
          <span className="text-xs font-mono text-slate-600 break-all">v{o.versi} · {o.pdf_path} · {formatTimestampWib(o.generated_at)}</span>
          <button type="button" className="text-xs text-blue-700 hover:underline whitespace-nowrap" onClick={() => downloadOutput(o.id, o.versi)}>Unduh</button>
        </div>)}
      </div>}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="flex gap-3 flex-wrap p-4"><input className="border p-2 rounded text-sm" aria-label="Cari test case" placeholder="Cari nomor, kebutuhan, hasil" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/><select className="border p-2 rounded text-sm" aria-label="Filter status" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}><option value="ALL">Semua</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option><option value="BELUM">BELUM</option></select><span className="text-xs text-slate-500 self-center">{visibleItems.length} item</span></div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 w-20">No</th>
              <th className="text-left px-3 py-2 w-16">Kat</th>
              <th className="text-left px-3 py-2">Kebutuhan</th>
              <th className="text-left px-3 py-2">Hasil</th>
              <th className="text-left px-3 py-2 w-28">Status</th>
              <th className="text-left px-3 py-2 w-28">Bukti</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((it) => (
              <tr key={it.id??it.no} className="border-t">
                <td className="px-3 py-2"><span className="font-mono text-xs">{it.no}</span></td>
                <td className="px-3 py-2"><span className="text-xs">{it.kategori}</span></td>
                <td className="px-3 py-2"><p className="text-xs whitespace-pre-wrap min-w-44">{it.kebutuhan}</p></td>
                <td className="px-3 py-2"><textarea aria-label={`Hasil ${it.no}`} value={it.hasil||''} disabled={sesi.status!=='DRAFT'||!canEdit||it.status==='FAIL'} onChange={e => update(it.idx, { hasil: e.target.value })} rows={2} className="w-full px-2 py-1 border rounded text-xs" /></td>
                <td className="px-3 py-2">
                  <select aria-label={`Status ${it.no}`} value={it.status} disabled={sesi.status!=='DRAFT'||!canEdit||it.status==='FAIL'} onChange={e => update(it.idx, { status: e.target.value as Item['status'] })} className="w-full px-2 py-1 border rounded text-xs">
                    <option>BELUM</option><option>PASS</option><option>FAIL</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  {it.id
                    ? <a href="#evidence-uji" onClick={()=>setSelectedEvidenceItemId(it.id)}
                        aria-label={(canEdit&&sesi.status==='DRAFT'?'Unggah atau lihat':'Lihat')+' bukti test case '+it.no}
                        className="inline-flex rounded px-2 py-1 text-xs font-medium text-blue-700 underline hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">
                        {canEdit&&sesi.status==='DRAFT'?'Unggah / Lihat':'Lihat bukti'}
                      </a>
                    : <span className="text-xs text-slate-500">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <nav aria-label="Navigasi halaman test case" className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border bg-white p-3 text-sm mb-4">
        <span>Halaman {safePage} dari {totalPages} ({visibleItems.length} item)</span>
        <div className="flex gap-2"><button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Sebelumnya</button><button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Berikutnya</button></div>
      </nav>
      <UatWorkflowPanel sessionId={sid} projectId={sesi.project_id} status={sesi.status} items={sesi.items||[]}
        selectedEvidenceItemId={selectedEvidenceItemId} onSelectEvidenceItem={setSelectedEvidenceItemId}/>
      <Modal open={!!preview && preview.sessionId === sid} onClose={() => setPreview(null)}
        title={`Pratinjau PDF · Sesi #${sid}`} size="lg">
        {preview && preview.sessionId === sid && <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Pratinjau sementara · {preview.pages} halaman · revisi {preview.revision}.
            Belum tersimpan ke database atau Storage.
          </p>
          {previewStale && <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            Data sesi berubah sejak pratinjau dibuat. Tutup dan buat pratinjau baru sebelum menyimpan PDF.
          </p>}
          <iframe title={`Isi pratinjau PDF sesi #${sid}`} src={preview.url}
            className="h-[58vh] min-h-[320px] w-full rounded border bg-slate-50" />
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <a href={preview.url} target="_blank" rel="noopener noreferrer"
              className="text-blue-700 underline">Buka pratinjau di tab baru</a>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPreview(null)}
                className="rounded border px-3 py-2">Tutup</button>
              <button type="button"
                onClick={() => pdfMut.mutate(preview)}
                disabled={previewStale || pdfMut.isPending || previewMut.isPending || !!items || !canEdit}
                className="inline-flex items-center gap-2 rounded bg-brand-600 px-3 py-2 font-medium text-white disabled:opacity-50">
                <Download size={16} /> {pdfMut.isPending ? 'Menyimpan PDF...' : 'Generate & Simpan PDF'}
              </button>
            </div>
          </div>
        </div>}
      </Modal>
    </>
  );
}