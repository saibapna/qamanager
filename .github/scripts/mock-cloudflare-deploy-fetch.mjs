// Strictly isolated test-only fetch implementation. No network is permitted.
const BASE = 'https://qamanager.saipulbahri-it.workers.dev';
const ACCOUNT = '11111111111111111111111111111111';
const SCRIPT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/qamanager`;
const json = (result,status=200)=>new Response(JSON.stringify({success:true,result}),{status,headers:{'Content-Type':'application/json'}});
const response = (content,status,type)=>new Response(content,{status,headers:{'Content-Type':type}});
let uploaded=false;
const bindings=[
  {name:'BROWSER',type:'browser'},
  {name:'HYPERDRIVE',type:'hyperdrive',id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},
  {name:'JWT_ACCESS_SECRET',type:'secret_text'},
  {name:'JWT_REFRESH_SECRET',type:'secret_text'}
];
globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  const method=String(options.method||'GET').toUpperCase();
  if(url===SCRIPT+'/deployments' && method==='GET'){
    return json({deployments:[{versions:[{version_id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',percentage:100}]}]});
  }
  if(url===SCRIPT+'/deployments' && method==='POST'){
    const body=JSON.parse(options.body);
    if(body.versions?.[0]?.version_id!=='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'||body.versions?.[0]?.percentage!==100){
      throw Error('Rollback did not restore original Worker version');
    }
    process.stderr.write('MOCK_ROLLBACK_RECEIVED\n');
    return json({id:'cccccccc-cccc-4ccc-cccc-cccccccccccc'});
  }
  if(url===SCRIPT+'/settings' && method==='GET'){
    return json({bindings:uploaded?[...bindings,{name:'PROJECT_LIVE',type:'durable_object_namespace',class_name:'ProjectLive'}]:bindings,compatibility_date:'2026-11-20',compatibility_flags:['nodejs_compat'],observability:{enabled:true}});
  }
  if(url===SCRIPT && method==='PUT'){
    if(!(options.body instanceof FormData))throw Error('Worker upload must be FormData');
    const metadata=JSON.parse(String(await options.body.get('metadata').text()));
    if(!metadata.bindings?.some(b=>b.name==='PROJECT_LIVE'&&b.class_name==='ProjectLive'))throw Error('Missing ProjectLive binding');
    if(!metadata.migrations?.new_sqlite_classes?.includes('ProjectLive'))throw Error('Missing durable object migration');
    uploaded=true;
    return json({id:'qamanager'});
  }
  if(url===BASE+'/projects'){
    return response('<!doctype html><html><body>QA Manager</body></html>',200,'text/html');
  }
  if(url===BASE+'/api/status'){
    return response(JSON.stringify({service:'qamanager',ready:true}),200,'application/json');
  }
  if(url===BASE+'/api/health'){
    return response(JSON.stringify({ok:process.env.MOCK_HEALTH_FAILURE!=='1',database:process.env.MOCK_HEALTH_FAILURE==='1'?'down':'connected'}),
      process.env.MOCK_HEALTH_FAILURE==='1'?503:200,'application/json');
  }
  throw Error('Test mock rejects unspecified URL: '+url+' '+method);
};
