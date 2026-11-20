import {useEffect,useState} from 'react';
import {api} from '@/api/client';

export function SecureImage({src,alt}:{src?:string;alt:string}) {
  const [blobUrl,setBlobUrl]=useState<string>();
  useEffect(()=>{
    if(!src)return;
    let active=true;let url:string|undefined;
    api.get<Blob>(src.replace(/^\/api(?=\/)/,''),{responseType:'blob'}).then(r=>{
      url=URL.createObjectURL(r.data);
      if(active)setBlobUrl(url);else URL.revokeObjectURL(url);
    }).catch(()=>setBlobUrl(undefined));
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[src]);
  return blobUrl?<img src={blobUrl} alt={alt} className="w-full border rounded"/>:
    <p className="text-xs text-slate-500 border p-4">Memuat gambar...</p>;
}
