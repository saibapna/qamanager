import { api } from './client';
export interface Project { id: number; kode: string; nama: string; instansi: string; bidang?: string; aktif: boolean; }
export const projectsApi = {
  list: () => api.get<Project[]>('/projects').then(r => r.data),
  get: (id: number) => api.get<Project>(`/projects/${id}`).then(r => r.data),
  create: (d: Omit<Project, 'id' | 'aktif'>) => api.post<Project>('/projects', d).then(r => r.data),
  remove: (id: number) => api.delete(`/projects/${id}`)
};
