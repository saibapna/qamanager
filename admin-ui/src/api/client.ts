import axios from 'axios';
import { useAuth } from '@/store/authStore';

export const api = axios.create({ baseURL: '/api', timeout: 60_000 });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      useAuth.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(new Error(err.response?.data?.error || err.message));
  }
);
