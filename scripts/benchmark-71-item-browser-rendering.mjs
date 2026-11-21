#!/usr/bin/env node
// Cloudflare Browser Rendering component benchmark. This is NOT a QA Manager
// end-to-end or official PDF equivalence acceptance test.
const accountId=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!accountId||!token){
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in a secure operator environment.');
  process.exitCode=2;
}else{
  const script="async ({page}) => {"
    +"const rows=Array.from({length:71},(_,i)=>'<tr><td>'+(i+1)+'</td><td>Uji aplikasi kebutuhan nomor '+(i+1)+'</td><td>Hasil pengujian sintetik</td></tr>');"
    +"const groups=[rows.slice(0,15),rows.slice(15,34),rows.slice(34,53),rows.slice(53,71)];"
    +"const css='<style>@page{size:A4;margin:15mm}body{font:9pt Arial,sans-serif}section{break-after:page;min-height:245mm}table{width:100%;border-collapse:collapse}td,th{border:1px solid #111;padding:5px;text-align:left}h1{font-size:13pt}</style>';"
    +"const html='<html><head>'+css+'</head><body><section><h1>Synthetic 71-case benchmark</h1><p>Not official UAT output</p></section>'+groups.map((g,i)=>'<section><h1>Bagian '+(i+1)+'</h1><table><tr><th>No</th><th>Kebutuhan</th><th>Hasil</th></tr>'+g.join('')+'</table></section>').join('')+'</body></html>';"
    +"await page.setContent(html,{waitUntil:'load'});"
    +"const times=[];let bytes=0;"
    +"for(let i=0;i<5;i++){const start=Date.now();const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,margin:{top:'15mm',right:'15mm',bottom:'15mm',left:'15mm'}});times.push(Date.now()-start);bytes=pdf.byteLength;}"
    +"return {kind:'synthetic_browser_pdf_component_only',case_count:71,page_count:5,render_times_ms:times,size_bytes:bytes};"
    +"}";
  try{
    const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(accountId)+'/browser-rendering/script';
    const response=await fetch(url,{
      method:'POST',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify({library:'playwright',timeout:100000,code:script}),
      signal:AbortSignal.timeout(120000)
    });
    const json=await response.json();
    if(!response.ok||!json.success||!json.result?.render_times_ms){
      console.error('Browser Rendering benchmark failed. HTTP '+response.status+'; check browser permission and quota.');
      process.exitCode=1;
    }else{
      const series=[...json.result.render_times_ms].sort((a,b)=>a-b);
      const p50=series[Math.floor((series.length-1)*0.5)];
      const p95=series[Math.ceil(series.length*0.95)-1];
      console.log(JSON.stringify({
        ...json.result,p50_ms:p50,p95_ms:p95,
        caveat:'Browser Rendering page.pdf only; excludes app authorization, Hyperdrive, storage and network'
      },null,2));
    }
  }catch(error){
    console.error('Benchmark unavailable: '+String(error.message||error).slice(0,200));
    process.exitCode=1;
  }
}
