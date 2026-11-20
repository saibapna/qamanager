import { Outlet, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { ToastContainer } from './Toast';
import { useAuth } from '@/store/authStore';

export function Layout() {
  const user=useAuth(s=>s.user);
  const ready=useAuth(s=>s.ready);
  const setSession=useAuth(s=>s.setSession);
  const setReady=useAuth(s=>s.setReady);
  useEffect(()=>{
    if(ready)return;
    let cancelled=false;
    (async()=>{
      try{
        let response=await fetch('/api/auth/me',{credentials:'same-origin'});
        if(!response.ok){
          const refresh=await fetch('/api/auth/refresh',{method:'POST',credentials:'same-origin',
            headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},body:'{}'});
          if(refresh.ok)response=await fetch('/api/auth/me',{credentials:'same-origin'});
        }
        if(response.ok){
          const current=await response.json();
          if(!cancelled)setSession({user:current});
        }
      }catch{}
      finally{if(!cancelled)setReady(true);}
    })();
    return ()=>{cancelled=true};
  },[ready,setSession,setReady]);
  if(!ready)return <div className="p-8" role="status">Memeriksa sesi...</div>;
  if(!user)return <Navigate to="/login" replace />;
  return <div className="flex min-h-screen">
    <Sidebar/>
    <main className="flex-1 md:ml-64 min-w-0 p-4 md:p-6"><Outlet/></main>
    <ToastContainer/>
  </div>;
}
