import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/store/authStore';
import { inputCls } from '@/components/FormField';
import { LogIn } from 'lucide-react';

export function LoginPage() {
  const nav = useNavigate();
  const setSession = useAuth(s => s.setSession);
  const [email, setEmail] = useState('admin@sirikap.id');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/login', { email, password });
      setSession(data); nav('/projects');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Login gagal');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6">ULO/UAT Manager</h1>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
          </div>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            <LogIn size={18} />{loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}
