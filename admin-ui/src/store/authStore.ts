import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'ADMIN' | 'TESTER' | 'WITNESS' | 'APPROVER' | 'AUDITOR';
export interface UserProject { project_id: number; kode: string; nama: string; role: Role; }
export interface User { id: number; email: string; nama: string; is_platform_admin?: boolean; projects: UserProject[]; }

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setSession: (s: { accessToken: string; refreshToken: string; user: User }) => void;
  logout: () => void;
  hasRole: (projectId: number, ...roles: Role[]) => boolean;
}

export const useAuth = create<AuthState>()(persist(
  (set, get) => ({
    accessToken: null, refreshToken: null, user: null,
    setSession: (s) => set({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }),
    logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    hasRole: (pid, ...roles) => {
      const m = get().user?.projects.find(p => p.project_id === pid);
      return !!m && roles.includes(m.role);
    }
  }), { name: 'ulo-auth' }
));
