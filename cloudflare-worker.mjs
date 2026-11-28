import {Buffer} from 'node:buffer';
import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
import {isAppRoute,applyOpenGraph} from './og.mjs';
import {createBillingServer} from './billing-server.mjs';
import {catalogResponse} from './catalog-server.mjs';
import {createEmailAlerts} from './email-alerts.mjs';
import {launchAccess} from './launch-access.mjs';
import {createOperations} from './operations-worker.mjs';

const handlers=new WeakMap();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
 async scheduled(event,env){
  await fetch('https://fictioncom.pages.dev/api/alerts/drain',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}});
  if(new Date(event.scheduledTime).getUTCMinutes()===0)await fetch('https://fictioncom.pages.dev/api/operations/run',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}});
 },
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/moderator/launch-checklist')return launchAccess(request);
  if(url.pathname.startsWith('/api/operations/'))return createOperations(env).handle(request);
  if(url.pathname.startsWith('/api/alerts/'))return createEmailAlerts(env).handle(request);
  if(url.pathname.startsWith('/api/billing/')){
   let handler=handlers.get(env);if(!handler){handler=createBillingServer({env});handlers.set(env,handler);}
   const req={method:request.method,headers:Object.fromEntries(request.headers),async *[Symbol.asyncIterator](){if(!request.body)return;const reader=request.body.getReader();try{while(true){const {value,done}=await reader.read();if(done)break;yield Buffer.from(value);}}finally{reader.releaseLock();}}};
   let status=200,headers={},body='';
   const res={writeHead(s,h){status=s;headers=h;},end(b){body=b||'';}};
   await handler(req,res,url);return new Response(body,{status,headers:{...headers,'X-Content-Type-Options':'nosniff'}});
  }
  if(url.pathname==='/healthz')return json({ok:true});
  if(url.pathname==='/api/catalog'){
   if(request.method!=='GET')return json({error:'Method not allowed.'},405);
   const reply=await catalogResponse(url);return json(reply.body,reply.status);
  }
  // Production currently disables paid AI review; preserve that behavior.
  if(url.pathname==='/api/review/status')return json({enabled:false,provider:'OpenAI',videoEnabled:false});
  if(url.pathname==='/api/review')return json({error:'AI review is not connected yet. Your upload remains private.'},503);
  if(url.pathname==='/api/client-error'){
   if(request.method!=='POST')return new Response(null,{status:405});
   if(request.headers.get('origin')!==url.origin)return new Response(null,{status:403});
   const reader=request.body?.getReader();let size=0;const chunks=[];
   if(reader){try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>128){await reader.cancel();return new Response(null,{status:413});}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}}
   try{const {code}=JSON.parse(Buffer.concat(chunks).toString());if(!['runtime','async'].includes(code))return new Response(null,{status:400});}catch{return new Response(null,{status:400});}
   return new Response(null,{status:204});
  }
  return serveDocument(request,env);
 }
};

async function serveDocument(request,env){
 const url=new URL(request.url);
 if(!env.ASSETS)return new Response('Not found',{status:404,headers:{'X-Content-Type-Options':'nosniff'}});
 if(!isAppRoute(url.pathname)){
  const asset=await env.ASSETS.fetch(request);
  if(asset.status!==404)return asset;
  return new Response('Not found',{status:404,headers:{'X-Content-Type-Options':'nosniff'}});
 }
 const headers=new Headers(request.headers);
 headers.delete('if-none-match');headers.delete('if-modified-since');
 const loadAsset=async path=>{
  const response=await env.ASSETS.fetch(new Request(new URL(path,url.origin),{method:'GET',headers,redirect:'manual'}));
  if(response.status>=300&&response.status<400){
   const next=response.headers.get('location');
   if(next)return env.ASSETS.fetch(new Request(new URL(next,url.origin),{method:'GET',headers,redirect:'manual'}));
  }
  return response;
 };
 let index=await loadAsset('/');
 if(!index.ok)index=await loadAsset('/index.html');
 if(!index.ok)return new Response('Not found',{status:index.status===308?404:index.status,headers:{'X-Content-Type-Options':'nosniff'}});
 const html=await applyOpenGraph(await index.text(),url,{supabaseUrl:SUPABASE_URL,supabaseKey:SUPABASE_KEY});
 return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
}
