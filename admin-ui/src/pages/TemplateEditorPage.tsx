import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import { Download, Save, Share2, Upload } from 'lucide-react';
import { templatesApi, Template } from '@/api/templates';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { Badge } from '@/components/Badge';
import { useAuth } from '@/store/authStore';

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const tid = Number(id);
  const toast = useToast();
  const qc = useQueryClient();
  const { data: tpl, isLoading } = useQuery({ queryKey: ['template', tid], queryFn: () => templatesApi.get(tid) });
  const [draft, setDraft] = useState<Partial<Template>>({});
  const [tab, setTab] = useState<'layout' | 'kategori' | 'page-map'>('layout');
  const isAdmin = useAuth(s => s.hasRole(Number(tpl?.project_id||0), 'ADMIN'));
  const { data: sharing, refetch: refetchSharing } = useQuery({
    queryKey:['template-sharing',tid], queryFn:()=>templatesApi.sharing(tid),
    enabled: !!tpl?.published && isAdmin
  });
  const shareMut = useMutation({
    mutationFn: (enable:boolean) => enable ? templatesApi.share(tid) : templatesApi.unshare(tid),
    onSuccess: (_result,enable) => {
      void refetchSharing();
      qc.invalidateQueries({queryKey:['shared-templates']});
      toast.push('success', enable ? 'Template tersedia di Katalog Bersama' : 'Berbagi template dinonaktifkan');
    },
    onError: (e:Error) => toast.push('error',e.message)
  });
  const toggleShare = () => {
    if (sharing?.shared) { shareMut.mutate(false); return; }
    if (window.confirm('Bagikan layout dan konfigurasi template ini ke administrator proyek lain? Pastikan tidak ada data pribadi di template. Data sesi, fixture PDF, bukti, dan tanda tangan tidak dibagikan.')) {
      shareMut.mutate(true);
    }
  };
  const { data: fixtures = [] } = useQuery({ queryKey: ['fixtures',tid], queryFn: () => templatesApi.fixtures(tid), enabled: !!tpl });

  useEffect(() => { if (tpl) setDraft(tpl); }, [tpl]);

  const saveMut = useMutation({
    mutationFn: () => templatesApi.update(tid, { nama:draft.nama, layout_hbs:draft.layout_hbs, partials:draft.partials, kategori_map:draft.kategori_map, page_map:draft.page_map }),
    onSuccess: (updated) => { setDraft(updated); qc.invalidateQueries({queryKey:['template',tid]}); toast.push('success','Template tersimpan'); },
    onError: (e:Error) => toast.push('error',e.message)
  });

  const publishMut = useMutation({
    mutationFn: () => templatesApi.publish(tid),
    onSuccess: () => { toast.push('success', 'Published'); location.reload(); },
    onError: (e: Error) => toast.push('error', e.message)
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => templatesApi.uploadFixture(tid, file),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fixtures',tid] }); toast.push('success', 'Fixture PDF berhasil disimpan'); },
    onError: (e: Error) => toast.push('error', e.message)
  });

  const download = async (fixtureId: number, name: string) => {
    try {
      const blob = await templatesApi.downloadFixture(tid, fixtureId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name || 'fixture.pdf'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) { toast.push('error', e instanceof Error ? e.message : 'Gagal mengunduh fixture'); }
  };

  if (isLoading || !draft.id) return <div>Memuat...</div>;

  return (
    <>
      <PageHeader title={`Template ${draft.nama}`}
        subtitle={`v${draft.versi} • ${draft.checksum?.slice(0, 12)}...`}
        actions={
          <>
            <Badge variant={draft.published ? 'success' : 'warning'}>{draft.published ? 'Published' : 'Draft'}</Badge>
            {!!draft.published && isAdmin && <button type="button"
              onClick={toggleShare} disabled={shareMut.isPending || !sharing}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-700 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40">
              <Share2 size={16}/> {sharing?.shared ? 'Hentikan Berbagi' : 'Bagikan Template'}
            </button>}
            <label className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer hover:bg-gray-50">
              <Upload size={16} /> Fixture
              <input type="file" accept="application/pdf" className="hidden"
                onChange={e => e.target.files?.[0] && uploadMut.mutate(e.target.files[0])} />
            </label>
            {!draft.published && (
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg disabled:opacity-50"><Save size={16} />Simpan</button>
            )}
            {!draft.published && (
              <button onClick={() => publishMut.mutate()}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Publish</button>
            )}
          </>
        } />
      {draft.published && isAdmin && <div className="mb-4 rounded-xl border bg-white p-4 text-sm">
        <p className="font-semibold">Berbagi pakai antarproyek</p>
        <p className="mt-1 text-slate-600">
          {sharing?.shared ? 'Template tersedia untuk disalin oleh administrator proyek lain.' :
            'Template belum masuk Katalog Bersama. Hanya ADMIN proyek ini yang dapat membagikan.'}
          {' '}Penerima memperoleh salinan DRAFT yang dapat disesuaikan; data uji, fixture, PDF, dan tanda tangan tidak ikut.
        </p>
      </div>}
      <div className="bg-white rounded-xl border p-4 mb-4">
        <p className="font-semibold text-sm mb-2">Fixture PDF baseline</p>
        {fixtures.length === 0 ? <p className="text-sm text-slate-500">Belum ada fixture. Unggah PDF baseline untuk verifikasi berkas.</p> :
          fixtures.map(f => <div key={f.id} className="flex justify-between items-center text-sm py-2 border-t">
            <span>{f.nama} · {f.page_count || '?'} halaman · {((f.size_bytes || 0)/1024).toFixed(1)} KB</span>
            <button type="button" className="inline-flex items-center gap-1 text-blue-700 hover:underline" onClick={() => download(f.id, f.nama)}><Download size={16}/> Unduh</button>
          </div>)}
        <p className="text-xs text-slate-500 mt-2">Validasi di Cloudflare saat ini memeriksa SHA-256 persis, bukan SSIM atau kesamaan visual piksel.</p>
      </div>
      <div className="bg-white rounded-xl border">
        <div className="flex border-b">
          {(['layout', 'kategori', 'page-map'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 ${tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500'}`}>
              {t === 'layout' ? 'Layout (.hbs)' : t === 'kategori' ? 'Kategori Map' : 'Page Map'}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'layout' && (
            <Editor height="600px" language="handlebars"
              value={draft.layout_hbs || ''} onChange={v => setDraft({ ...draft, layout_hbs: v || '' })}
              options={{ minimap: { enabled: false }, readOnly:!!draft.published }} />
          )}
          {tab === 'kategori' && (
            <Editor height="600px" language="json"
              value={JSON.stringify(draft.kategori_map || {}, null, 2)}
              onChange={v => { try { setDraft({ ...draft, kategori_map: JSON.parse(v || '{}') }); } catch {} }}
              options={{ minimap: { enabled: false }, readOnly:!!draft.published }} />
          )}
          {tab === 'page-map' && (
            <Editor height="600px" language="json"
              value={JSON.stringify(draft.page_map || {}, null, 2)}
              onChange={v => { try { setDraft({ ...draft, page_map: JSON.parse(v || '{}') }); } catch {} }}
              options={{ minimap: { enabled: false }, readOnly:!!draft.published }} />
          )}
        </div>
      </div>
    </>
  );
}
