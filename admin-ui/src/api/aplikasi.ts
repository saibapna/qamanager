import { api } from './client';
export interface Aplikasi {id:number;project_id:number;nama_singkat:string;nama_panjang?:string;url?:string;}
export interface SesiCreate {template_id:number;hari?:string;tanggal?:string;tempat?:string;jenis?:string;}
export interface SesiSummary {id:number;status:string;created_at:string;template_id:number;aplikasi_id:number;}
export const aplikasiApi={
  list: (projectId:number)=>api.get<Aplikasi[]>(`/projects/${projectId}/aplikasi`).then(r=>r.data),
  create:(projectId:number,data:{nama_singkat:string;nama_panjang?:string;url?:string})=>
    api.post<Aplikasi>(`/projects/${projectId}/aplikasi`,data).then(r=>r.data),
  sessions:(aplikasiId:number)=>api.get<SesiSummary[]>(`/aplikasi/${aplikasiId}/sesi`).then(r=>r.data),
  createSession:(aplikasiId:number,data:SesiCreate)=>api.post<SesiSummary>(`/aplikasi/${aplikasiId}/sesi`,data).then(r=>r.data)
};
