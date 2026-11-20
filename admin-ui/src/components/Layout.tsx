import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ToastContainer } from './Toast';
import { useAuth } from '@/store/authStore';

export function Layout() {
  const token = useAuth(s => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64 p-6"><Outlet /></main>
      <ToastContainer />
    </div>
  );
}
