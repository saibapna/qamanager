import { api } from './client';
export interface Template { id: number; versi: string; nama: string; layout_hbs?: string; partials?: any; kategori_map?: any; page_map?: any; published: boolean; checksum: string; }
export const templatesApi = {
  listByProject: (pid: number) => api.get<Template[]>(`/projects/${pid}/templates`).then(r => r.data),
  get: (id: number) => api.get<Template>(`/templates/${id}`).then(r => r.data),
  create: (pid: number, d: Partial<Template>) => api.post<Template>(`/projects/${pid}/templates`, d).then(r => r.data),
  publish: (id: number) => api.post(`/templates/${id}/publish`),
  uploadFixture: (id: number, file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post(`/templates/${id}/fixtures`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
};
