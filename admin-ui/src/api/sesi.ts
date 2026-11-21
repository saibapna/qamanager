import { api } from './client';
export interface Sesi { id: number; project_id: number; status: string; revision?: number; finalized_at?: string | null; tanggal?: string | null; hari?: string | null; pukul?: string | null; created_at?: string | null; aplikasi_id: number; template_id: number; items?: Item[]; ringkasan?: Ringkasan; }
export interface Item { id?: number; no: string; kategori: string; kebutuhan: string; hasil: string; status: 'PASS' | 'FAIL' | 'BELUM'; urutan: number; }
export interface Ringkasan { total: number; lulus: number; gagal: number; belum: number; }
export interface PdfPreview {
  blob: Blob;
  sourceRevision: number;
  sourceStatus: string;
  sourceHtmlSha256: string;
  pageCount: number;
}
export interface PdfPreviewToken {
  expected_revision: number;
  expected_status: string;
  preview_html_sha256: string;
}
export const sesiApi = {
  get: (id: number) => api.get<Sesi>(`/sesi/${id}`).then(r => r.data),
  updateItems: (id: number, items: Item[], expected_revision: number) => api.put(`/sesi/${id}/items`, { items, expected_revision }),
  previewPdf: async (id: number): Promise<PdfPreview> => {
    const response = await api.post<Blob>(`/sesi/${id}/pdf/preview`, {}, { responseType: 'blob' });
    const sha = String(response.headers['x-pdf-preview-sha256'] || '');
    const sourceRevision = Number(response.headers['x-pdf-preview-revision']);
    const sourceStatus = String(response.headers['x-pdf-preview-status'] || '');
    const pageCount = Number(response.headers['x-pdf-preview-pages']);
    if (!/^[a-f0-9]{64}$/.test(sha) || !Number.isSafeInteger(sourceRevision) ||
        sourceRevision < 1 || !sourceStatus || !Number.isSafeInteger(pageCount) || pageCount < 1 ||
        !response.data || response.data.type !== 'application/pdf') {
      throw new Error('Respons pratinjau PDF tidak lengkap atau tidak valid');
    }
    return { blob: response.data, sourceHtmlSha256: sha, sourceRevision, sourceStatus, pageCount };
  },
  generatePdf: (id: number, preview?: PdfPreviewToken) =>
    api.post<Blob>(`/sesi/${id}/pdf`, preview || {}, { responseType: 'blob' }).then(r => r.data),
  outputs: (id: number) => api.get<{id:number;versi:number;pdf_path:string;generated_at:string}[]>(`/sesi/${id}/outputs`).then(r => r.data),
  downloadOutput: (sessionId: number, outputId: number) => api.get<Blob>(`/sesi/${sessionId}/outputs/${outputId}/download`, { responseType: 'blob' }).then(r => r.data),
  finalize: (id: number) => api.post(`/sesi/${id}/finalize`),
  reopen: (id: number) => api.post(`/sesi/${id}/reopen`)
};