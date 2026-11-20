import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@/store/authStore';
import { inputCls } from '@/components/FormField';
import { Eye, EyeOff, LogIn } from 'lucide-react';

export function LoginPage() {
  const nav = useNavigate();
  const setSession = useAuth(s => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/login', { email: email.trim(), password }, { withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      setSession(data); nav('/projects');
    } catch (e: any) {
      setError(e.response?.status === 401 ? 'Email atau password tidak cocok. Gunakan password akun QA Manager, bukan password database PostgreSQL.' : (e.response?.data?.error || 'Login gagal. Periksa koneksi API dan coba kembali.'));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6">ULO/UAT Manager</h1>
        <p className="mb-5 text-sm text-slate-600">
          Masuk menggunakan akun QA Manager yang terdaftar. Password aplikasi berbeda dari password PostgreSQL.
        </p>
        <form onSubmit={onSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" name="email" autoComplete="username" required autoFocus value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pr-12`} />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-2 flex items-center px-2 text-slate-500 hover:text-slate-900" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
