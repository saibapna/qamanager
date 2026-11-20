import { create } from 'zustand';
export type Role = 'ADMIN' | 'TESTER' | 'WITNESS' | 'APPROVER' | 'AUDITOR';
export interface UserProject { project_id: number; kode: string; nama: string; role: Role; }
export interface User { id: number; email: string; nama: string; is_platform_admin?:boolean; projects: UserProject[]; }
interface AuthState {
  user: User | null;
  ready: boolean;
  setSession: (s:{user:User})=>void;
  setReady: (ready:boolean)=>void;
  logout: ()=>void;
  hasRole: (projectId:number,...roles:Role[])=>boolean;
}
export const useAuth=create<AuthState>((set,get)=>({
  user:null,ready:false,
  setSession:s=>set({user:s.user,ready:true}),
  setReady:ready=>set({ready}),
  logout:()=>{
    // Session bearer/refresh tokens are ONLY in HttpOnly cookies, never localStorage.
    void fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:'{}',credentials:'same-origin',keepalive:true}).catch(()=>{});
    set({user:null,ready:true});
  },
  hasRole:(pid,...roles)=>{
    const member=get().user?.projects.find(p=>p.project_id===pid);
    return !!member&&roles.includes(member.role);
  }
}));
