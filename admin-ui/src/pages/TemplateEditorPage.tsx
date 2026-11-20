import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import { Save, Upload } from 'lucide-react';
import { templatesApi, Template } from '@/api/templates';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { Badge } from '@/components/Badge';

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const tid = Number(id);
  const toast = useToast();
  const { data: tpl, isLoading } = useQuery({ queryKey: ['template', tid], queryFn: () => templatesApi.get(tid) });
  const [draft, setDraft] = useState<Partial<Template>>({});
  const [tab, setTab] = useState<'layout' | 'kategori' | 'page-map'>('layout');

  useEffect(() => { if (tpl) setDraft(tpl); }, [tpl]);

  const publishMut = useMutation({
    mutationFn: () => templatesApi.publish(tid),
    onSuccess: () => { toast.push('success', 'Published'); location.reload(); },
    onError: (e: Error) => toast.push('error', e.message)
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => templatesApi.uploadFixture(tid, file),
    onSuccess: () => toast.push('success', 'Fixture diunggah'),
    onError: (e: Error) => toast.push('error', e.message)
  });

  if (isLoading || !draft.id) return <div>Memuat...</div>;

  return (
    <>
      <PageHeader title={`Template ${draft.nama}`}
        subtitle={`v${draft.versi} • ${draft.checksum?.slice(0, 12)}...`}
        actions={
          <>
            <Badge variant={draft.published ? 'success' : 'warning'}>{draft.published ? 'Published' : 'Draft'}</Badge>
            <label className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer hover:bg-gray-50">
              <Upload size={16} /> Fixture
              <input type="file" accept="application/pdf" className="hidden"
                onChange={e => e.target.files?.[0] && uploadMut.mutate(e.target.files[0])} />
            </label>
            {!draft.published && (
              <button onClick={() => publishMut.mutate()}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Publish</button>
            )}
          </>
        } />
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
              options={{ minimap: { enabled: false } }} />
          )}
          {tab === 'kategori' && (
            <Editor height="600px" language="json"
              value={JSON.stringify(draft.kategori_map || {}, null, 2)}
              onChange={v => { try { setDraft({ ...draft, kategori_map: JSON.parse(v || '{}') }); } catch {} }}
              options={{ minimap: { enabled: false } }} />
          )}
          {tab === 'page-map' && (
            <Editor height="600px" language="json"
              value={JSON.stringify(draft.page_map || {}, null, 2)}
              onChange={v => { try { setDraft({ ...draft, page_map: JSON.parse(v || '{}') }); } catch {} }}
              options={{ minimap: { enabled: false } }} />
          )}
        </div>
      </div>
    </>
  );
}
