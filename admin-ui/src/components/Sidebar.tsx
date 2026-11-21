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
  const signOut=()=>{logout();nav('/login');};
  return (
    <>
    <nav className="md:hidden sticky top-0 z-30 bg-slate-900 text-white px-3 py-3 flex flex-wrap items-center gap-3" aria-label="Navigasi utama">
      <span className="font-semibold text-sm">ULO/UAT Manager</span>
      {links.map(l=><NavLink key={l.to} to={l.to} className="text-sm underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">{l.label}</NavLink>)}
      <button onClick={signOut} className="text-red-300 text-sm ml-auto rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Keluar</button>
    </nav>
    <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 bg-slate-900 text-slate-100 p-4 flex-col">
      <div className="mb-8">
        <h1 className="text-xl font-bold">ULO/UAT Manager</h1>
        <p className="text-xs text-slate-400 mt-1">Multi-Project</p>
      </div>
      <nav aria-label="Navigasi utama desktop" className="space-y-1 flex-1">
        {links.map(l => {
          const Icon = l.icon;
          return (
            <NavLink key={l.to} to={l.to}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                isActive ? 'bg-brand-600' : 'hover:bg-slate-800',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
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
        <button onClick={signOut}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-slate-800 rounded-lg text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <LogOut size={16} /> Logout
        </button>
      </div>
    </aside>
    </>
  );
}
