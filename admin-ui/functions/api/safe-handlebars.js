import Handlebars from 'handlebars';

// Cloudflare Workers cannot execute Handlebars.compile() because it emits new Function().
// Interpret the parsed Handlebars AST instead: only paths, #each, #if, #unless, #with and static partials.
const MAX_DEPTH=25;
const MAX_VISITS=30000;
const MAX_RENDER=2000000;
const blocked=new Set(['__proto__','prototype','constructor']);
const has=(v,key)=>v!=null&&Object.prototype.hasOwnProperty.call(Object(v),key);
const valueAt=(obj,parts)=>{
  let cur=obj;
  for(const key of parts){
    if(!key||key==='this'||key==='.'||key==='[]')continue;
    if(blocked.has(key))return undefined;
    if(!has(cur,key))return undefined;
    cur=cur[key];
  }
  return cur;
};
function pathValue(node,frames,root){
  if(!node)return undefined;
  if(['StringLiteral','NumberLiteral','BooleanLiteral','NullLiteral','UndefinedLiteral'].includes(node.type))return node.value;
  if(node.type!=='PathExpression')throw new Error('Helper atau ekspresi tidak didukung: '+node.type);
  const raw=String(node.original||'');
  if(raw==='@root')return root;
  if(raw.startsWith('@root.'))return valueAt(root,raw.slice(6).split('.'));
  const last=frames[frames.length-1];
  if(raw==='@index')return last?.index??0;
  if(raw==='@first')return (last?.index??0)===0;
  if(raw==='@last')return !!last?.last;
  if(raw==='@key')return last?.key??'';
  let scope=frames.length-1,text=raw;
  while(text.startsWith('../')){scope=Math.max(0,scope-1);text=text.slice(3);}
  const anchored=text==='this'||text==='.'||text.startsWith('this.')||text.startsWith('./');
  text=text.replace(/^(this\.|\.\/)/,'');
  const parts=text.replace(/\//g,'.').replace(/^\[(.*)\]$/,'$1').split('.');
  const result=valueAt(frames[scope]?.value,parts);
  // Supports shared document headers when partial is included from inside #each pages.
  return result===undefined&&!anchored&&scope>0?valueAt(root,parts):result;
}
const truthy=v=>!(v==null||v===false||v===0||v===''||(Array.isArray(v)&&v.length===0));
const asText=v=>v==null?'':typeof v==='object'?'[object Object]':String(v);

export function renderSafeHandlebars(template,context,partials={}){
  if(typeof template!=='string'||template.length>500000)throw new Error('Ukuran template tidak valid');
  const root=context||{};
  const parsed=Handlebars.parse(template);
  let output='',visits=0;
  const partialCache=new Map();
  const append=s=>{
    output+=s;
    if(output.length>MAX_RENDER)throw new Error('HTML hasil UAT melebihi batas');
  };
  function run(ast,frames,depth){
    if(depth>MAX_DEPTH)throw new Error('Template bersarang terlalu dalam');
    for(const n of ast?.body||[]){
      if(++visits>MAX_VISITS)throw new Error('Template terlalu kompleks');
      if(n.type==='ContentStatement'){append(n.value);continue;}
      if(n.type==='CommentStatement')continue;
      if(n.type==='MustacheStatement'){
        if(n.params?.length||n.hash?.pairs?.length)throw new Error('Helper template belum didukung');
        const v=pathValue(n.path,frames,root);
        append(n.escaped===false?asText(v):Handlebars.escapeExpression(v));
        continue;
      }
      if(n.type==='PartialStatement'){
        const name=n.name?.original;
        if(typeof name!=='string'||!/^[a-z][a-z0-9_-]{0,40}$/i.test(name)||!has(partials,name)||typeof partials[name]!=='string')
          throw new Error('Partial template tidak dikenali');
        let partial=partialCache.get(name);
        if(!partial){partial=Handlebars.parse(partials[name]);partialCache.set(name,partial);}
        run(partial,frames,depth+1);
        continue;
      }
      if(n.type==='BlockStatement'){
        const name=n.path?.original;
        if(n.hash?.pairs?.length)throw new Error('Parameter block template tidak didukung');
        if(!['each','if','unless','with'].includes(name))throw new Error('Block template tidak didukung: '+String(name));
        if(n.params?.length!==1)throw new Error('Parameter block wajib satu ekspresi');
        const value=pathValue(n.params[0],frames,root);
        if(name==='if'||name==='unless'){
          const pass=truthy(value)===(name==='if');
          run(pass?n.program:n.inverse,frames,depth+1);
        }else if(name==='with'){
          if(truthy(value))run(n.program,[...frames,{value}],depth+1);
          else run(n.inverse,frames,depth+1);
        }else{
          const entries=Array.isArray(value)?value.map((v,i)=>[i,v]):value&&typeof value==='object'?Object.entries(value):[];
          if(!entries.length){run(n.inverse,frames,depth+1);continue;}
          entries.forEach(([key,v],i)=>run(n.program,[...frames,{value:v,index:i,key,last:i===entries.length-1}],depth+1));
        }
        continue;
      }
      throw new Error('Sintaks template belum didukung: '+n.type);
    }
  }
  run(parsed,[{value:root}],0);
  return output;
}
