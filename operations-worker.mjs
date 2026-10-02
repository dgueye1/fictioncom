import {timingSafeEqual} from 'node:crypto';
import {SUPABASE_URL} from './config.js';
export function createOperations(env,request=fetch){
 const service=env.SUPABASE_SERVICE_ROLE_KEY,headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=minimal,resolution=ignore-duplicates'};
 async function call(route,method='GET',body){const r=await request(SUPABASE_URL+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Operations request failed');const text=await r.text();return text?JSON.parse(text):null;}
 async function inventory(){return call('/rest/v1/rpc/owner_operations_status','POST',{});}
 async function cleanup(){
  if(env.STORY_CLEANUP_ENABLED!=='true')return {enabled:false,removed:0};
  const expired=await call('/rest/v1/posts?kind=eq.story&expires_at=lt.'+encodeURIComponent(new Date().toISOString())+'&select=id,author,media_path&order=expires_at&limit=20');let removed=0;
  for(const story of expired){
   if(!new RegExp('^'+story.author+'/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\\.(jpg|jpeg|png|webp|mp4|webm)$').test(story.media_path||''))continue;
   await call('/storage/v1/object/community-media','DELETE',{prefixes:[story.media_path]});
   await call('/rest/v1/posts?id=eq.'+story.id+'&kind=eq.story&expires_at=lt.'+encodeURIComponent(new Date().toISOString()),'DELETE');removed++;
  }
  return {enabled:true,removed};
 }
 async function usage(){
  const metrics=await inventory();
  if(metrics.database_bytes>=400000000||metrics.storage_bytes>=800000000){
   const event='usage:'+new Date().toISOString().slice(0,10);
   await call('/rest/v1/owner_email_alerts?on_conflict=event_key','POST',{event_key:event,kind:'usage',metrics:{database_bytes:metrics.database_bytes,storage_bytes:metrics.storage_bytes}});
  }
  return {database_bytes:metrics.database_bytes,storage_bytes:metrics.storage_bytes};
 }
 async function handle(req){
  const expected='Bearer '+service,token=req.headers.get('authorization')||'';
  if(!service||token.length!==expected.length||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))return new Response(null,{status:403});
  const path=new URL(req.url).pathname;
  if(path==='/api/operations/status'&&req.method==='GET')return Response.json(await inventory(),{headers:{'Cache-Control':'no-store'}});
  if(path!=='/api/operations/run'||req.method!=='POST')return new Response(null,{status:405});
  return Response.json({cleanup:await cleanup(),usage:await usage()},{headers:{'Cache-Control':'no-store'}});
 }
 return {handle,cleanup,usage};
}
