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
// Exact production host only. Preview hosts such as *.fictioncom.pages.dev stay put.
// The fragment (#access_token) never reaches the server; Location has no fragment, so the browser keeps it.
export function legacyPagesRedirect(url){
 if(url.hostname!=='fictioncom.pages.dev')return null;
 return new Response(null,{status:301,headers:{Location:'https://fictioncom.com'+url.pathname+url.search}});
}
export default {
 async scheduled(event,env){
  await fetch('https://fictioncom.com/api/alerts/drain',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}});
  if(new Date(event.scheduledTime).getUTCMinutes()===0)await fetch('https://fictioncom.com/api/operations/run',{method:'POST',headers:{Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY}});
 },
 async fetch(request,env){
  const url=new URL(request.url);
  const redirect=legacyPagesRedirect(url);
  if(redirect)return redirect;
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

export async function readAsset(fetchAsset,origin,pathname){
 let current=new URL(pathname,origin);
 const seen=new Set();
 for(let hop=0;hop<5;hop++){
  if(seen.has(current.href))break;
  seen.add(current.href);
  const response=await fetchAsset(current);
  if(response.status<300||response.status>=400)return response;
  const location=response.headers.get('location');
  current=location?new URL(location,current):new URL('/',origin);
 }
 return fetchAsset(new URL('/',origin));
}
async function serveDocument(request,env){
 const url=new URL(request.url);
 if(!env.ASSETS)return new Response('Not found',{status:404,headers:{'X-Content-Type-Options':'nosniff'}});
 if(!isAppRoute(url.pathname)){
  const asset=await env.ASSETS.fetch(request);
  if(asset.status!==404)return asset;
  return new Response('Not found',{status:404,headers:{'X-Content-Type-Options':'nosniff'}});
 }
 const index=await readAsset(assetUrl=>env.ASSETS.fetch(new Request(assetUrl,{method:'GET'})),url.origin,'/index.html');
 if(!index.ok)return new Response('Not found',{status:404,headers:{'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
 const html=await applyOpenGraph(await index.text(),url,{supabaseUrl:SUPABASE_URL,supabaseKey:SUPABASE_KEY});
 return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Permissions-Policy':'geolocation=()','Referrer-Policy':'strict-origin-when-cross-origin'}});
}
