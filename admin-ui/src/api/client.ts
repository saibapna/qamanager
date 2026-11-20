import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '@/store/authStore';

export const api=axios.create({baseURL:'/api',timeout:120_000,withCredentials:true});
api.interceptors.request.use(config=>{
  config.headers.set('X-Requested-With','XMLHttpRequest');
  return config;
});
let refreshing:Promise<void>|null=null;
api.interceptors.response.use(response=>response,async(err:AxiosError)=>{
  const config=err.config as (InternalAxiosRequestConfig & {_retry?:boolean})|undefined;
  if(err.response?.status===401&&config&&!config._retry&&!config.url?.startsWith('/auth/')){
    config._retry=true;
    try{
      if(!refreshing){
        refreshing=axios.post('/api/auth/refresh',{},{
          withCredentials:true,headers:{'X-Requested-With':'XMLHttpRequest'}
        }).then(({data})=>{useAuth.getState().setSession(data)}).finally(()=>{refreshing=null});
      }
      await refreshing;
      return api(config);
    }catch{
      useAuth.getState().setReady(true);
      useAuth.setState({user:null});
      window.location.assign('/login');
    }
  }
  return Promise.reject(new Error((err.response?.data as {error?:string})?.error||err.message));
});
