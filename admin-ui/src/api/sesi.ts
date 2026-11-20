import { api } from './client';
export interface Sesi { id: number; project_id: number; status: string; aplikasi_id: number; template_id: number; items?: Item[]; ringkasan?: Ringkasan; }
export interface Item { id?: number; no: string; kategori: string; kebutuhan: string; hasil: string; status: 'PASS' | 'FAIL' | 'BELUM'; urutan: number; }
export interface Ringkasan { total: number; lulus: number; gagal: number; belum: number; }
export const sesiApi = {
  get: (id: number) => api.get<Sesi>(`/sesi/${id}`).then(r => r.data),
  updateItems: (id: number, items: Item[]) => api.put(`/sesi/${id}/items`, { items }),
  generatePdf: (id: number) => api.post(`/sesi/${id}/pdf`, {}, { responseType: 'blob' }).then(r => r.data),
  outputs: (id: number) => api.get<{id:number;versi:number;pdf_path:string;generated_at:string}[]>(`/sesi/${id}/outputs`).then(r => r.data),
  downloadOutput: (sessionId: number, outputId: number) => api.get<Blob>(`/sesi/${sessionId}/outputs/${outputId}/download`, { responseType: 'blob' }).then(r => r.data),
  finalize: (id: number) => api.post(`/sesi/${id}/finalize`)
};
