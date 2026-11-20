import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '@/store/authStore';

export const api = axios.create({baseURL:'/api', timeout:120_000});
api.interceptors.request.use((config) => {
  const token=useAuth.getState().accessToken;
  if(token)config.headers.Authorization=`Bearer ${token}`;
  return config;
});

let refreshRequest: Promise<void> | null = null;
api.interceptors.response.use(r=>r,async(err:AxiosError)=>{
  const config=err.config as (InternalAxiosRequestConfig & {_retry?:boolean}) | undefined;
  if(err.response?.status===401 && config && !config._retry && !config.url?.startsWith('/auth/')){
    config._retry=true;
    try {
      if(!refreshRequest){
        refreshRequest=(async()=>{
          const token=useAuth.getState().refreshToken;
          if(!token)throw new Error('Sesi berakhir');
          const {data}=await axios.post('/api/auth/refresh',{refreshToken:token});
          useAuth.getState().setSession(data);
        })().finally(()=>{refreshRequest=null;});
      }
      await refreshRequest;
      config.headers.Authorization=`Bearer ${useAuth.getState().accessToken}`;
      return api(config);
    }catch{
      useAuth.getState().logout();
      window.location.assign('/login');
    }
  }
  return Promise.reject(new Error((err.response?.data as {error?:string})?.error || err.message));
});
