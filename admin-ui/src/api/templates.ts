import { api } from './client';
export interface Template { id: number; project_id?: number; versi: string; nama: string; layout_hbs?: string; partials?: any; kategori_map?: any; page_map?: any; published: boolean; checksum: string; }
export interface SharedTemplate {
  id: number;
  nama: string;
  versi: string;
  checksum: string;
  created_at: string;
  source_project_code: string;
  source_project_name: string;
  shared_at: string;
}
export interface TemplateSharingStatus { shared: boolean; shared_at: string | null; }
export interface Fixture { id: number; template_id: number; nama: string; sha256: string; size_bytes?: number; page_count?: number; created_at: string; }
export const templatesApi = {
  listByProject: (pid: number) => api.get<Template[]>(`/projects/${pid}/templates`).then(r => r.data),
  sharedCatalog: (pid: number) =>
    api.get<SharedTemplate[]>(`/projects/${pid}/shared-templates`).then(r => r.data),
  sharing: (tid: number) =>
    api.get<TemplateSharingStatus>(`/templates/${tid}/share`).then(r => r.data),
  share: (tid: number) =>
    api.post<TemplateSharingStatus>(`/templates/${tid}/share`).then(r => r.data),
  unshare: (tid: number) =>
    api.delete<TemplateSharingStatus>(`/templates/${tid}/share`).then(r => r.data),
  importShared: (pid: number, sourceId: number, versi: string) =>
    api.post<Template>(`/projects/${pid}/templates/import`, {source_template_id:sourceId,versi}).then(r=>r.data),
  get: (id: number) => api.get<Template>(`/templates/${id}`).then(r => r.data),
  create: (pid: number, d: Partial<Template>) => api.post<Template>(`/projects/${pid}/templates`, d).then(r => r.data),
  publish: (id: number) => api.post(`/templates/${id}/publish`),
  update: (id: number, d: Partial<Template>) => api.patch<Template>(`/templates/${id}`, d).then(r => r.data),
  fixtures: (id: number) => api.get<Fixture[]>(`/templates/${id}/fixtures`).then(r => r.data),
  downloadFixture: (id: number, fixtureId: number) =>
    api.get<Blob>(`/templates/${id}/fixtures/${fixtureId}/download`, { responseType: 'blob' }).then(r => r.data),
  uploadFixture: (id: number, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post(`/templates/${id}/fixtures`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};
