import { NavLink, useNavigate } from 'react-router-dom';
import { FolderKanban, FileCode2, ClipboardList, ShieldCheck, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/store/authStore';

const links = [
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/validate', label: 'Validasi 1=1', icon: ShieldCheck }
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 text-slate-100 p-4 flex flex-col">
      <div className="mb-8">
        <h1 className="text-xl font-bold">ULO/UAT Manager</h1>
        <p className="text-xs text-slate-400 mt-1">Multi-Project</p>
      </div>
      <nav className="space-y-1 flex-1">
        {links.map(l => {
          const Icon = l.icon;
          return (
            <NavLink key={l.to} to={l.to}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                isActive ? 'bg-brand-600' : 'hover:bg-slate-800'
              )}>
              <Icon size={18} />{l.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="pt-4 border-t border-slate-700">
        <div className="px-3 py-2 text-xs text-slate-400">
          <p className="font-medium text-slate-200">{user?.nama}</p>
          <p>{user?.email}</p>
        </div>
        <button onClick={() => { logout(); nav('/login'); }}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-800 rounded-lg text-red-400">
          <LogOut size={16} /> Logout
        </button>
      </div>
    </aside>
  );
}
