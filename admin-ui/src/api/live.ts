import { api } from './client';
export type SessionProgress = { id: number; status: string; revision: number; nama_singkat: string; total: number; lulus: number; gagal: number; belum: number };
export type ProjectActivity = { id: number; action: string; entity_type: string; entity_id: number; occurred_at: string; actor: string | null };
export const liveApi = {
  dashboard: (projectId: number) => api.get<SessionProgress[]>(`/projects/${projectId}/live-dashboard`).then(r => r.data),
  activity: (projectId: number) => api.get<ProjectActivity[]>(`/projects/${projectId}/activity`).then(r => r.data),
};
