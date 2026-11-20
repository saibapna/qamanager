import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileCode2, ClipboardList } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { templatesApi } from '@/api/templates';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/Badge';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);
  const { data: project } = useQuery({ queryKey: ['project', pid], queryFn: () => projectsApi.get(pid) });
  const { data: templates = [] } = useQuery({ queryKey: ['templates', pid], queryFn: () => templatesApi.listByProject(pid) });

  if (!project) return <div>Memuat...</div>;
  return (
    <>
      <PageHeader title={project.nama} subtitle={`${project.kode} • ${project.instansi}`} />
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <FileCode2 className="text-brand-600 mb-2" />
          <p className="text-2xl font-bold">{templates.length}</p>
          <p className="text-xs text-slate-500">Templates</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <ClipboardList className="text-brand-600 mb-2" />
          <p className="text-2xl font-bold">-</p>
          <p className="text-xs text-slate-500">Sesi ULO</p>
        </div>
      </div>
      <h3 className="font-semibold mb-3">Templates</h3>
      <div className="bg-white rounded-xl border divide-y">
        {templates.map(t => (
          <Link key={t.id} to={`/templates/${t.id}`} className="p-4 flex items-center justify-between hover:bg-slate-50">
            <div>
              <p className="font-medium text-sm">{t.nama}</p>
              <p className="text-xs text-slate-500 font-mono">v{t.versi}</p>
            </div>
            <Badge variant={t.published ? 'success' : 'warning'}>{t.published ? 'Published' : 'Draft'}</Badge>
          </Link>
        ))}
      </div>
    </>
  );
}
