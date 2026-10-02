import {createHmac,timingSafeEqual} from 'node:crypto';
import {SUPABASE_URL} from './config.js';
const recipient='doudousygueye1997@gmail.com';
export function createEmailAlerts(env,request=fetch){
 const service=env.SUPABASE_SERVICE_ROLE_KEY;
 const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 async function database(path,method='GET',body){
  const response=await request(SUPABASE_URL+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Alert storage unavailable');
  return response.status===204?null:response.json();
 }
 async function drain(){
  if(!service||!env.BREVO_API_KEY)return {ready:false,sent:0};
  const rows=await database('rpc/claim_owner_email_alerts','POST',{});let sent=0;
  for(const row of rows){
   const label={visit:'A new visit to FictionCom',signup:'A new FictionCom account was registered',support:'A new support request',feedback:'New FictionCom feedback',usage:'FictionCom is approaching its free storage limits'}[row.kind];
   const body=label+'\n\nTime: '+row.created_at+'\n'+(row.kind==='usage'?'Database: '+Math.round(Number(row.metrics?.database_bytes||0)/1000000)+' MB of 500 MB. Uploaded files: '+Math.round(Number(row.metrics?.storage_bytes||0)/1000000)+' MB of 1000 MB. Review usage in Supabase.':row.kind==='visit'?'This is a new 30-minute visit session. No visitor IP or browsing history is included.':row.kind==='signup'?'Account ID: '+row.subject_id:'Request ID: '+row.subject_id+'\nOpen your moderator dashboard → Support inbox to read and reply.')+'\n\nhttps://fictioncom.pages.dev/';
   try{
    const response=await request('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({sender:{name:'FictionCom',email:'doudousygueye12@gmail.com'},to:[{email:recipient}],subject:label,textContent:body,headers:{'X-Mailin-custom':'fictioncom-alert:'+row.id}}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Email delivery deferred');
    await database('owner_email_alerts?id=eq.'+row.id,'PATCH',{sent_at:new Date().toISOString(),lease_until:null});sent++;
   }catch{
    await database('owner_email_alerts?id=eq.'+row.id,'PATCH',{lease_until:null,next_attempt_at:new Date(Date.now()+Math.min(24,Math.max(1,row.attempts))*3600000).toISOString()});
   }
  }
  return {ready:true,sent};
 }
 async function handle(requestObject){
  const url=new URL(requestObject.url);
  if(requestObject.method!=='POST')return new Response(null,{status:405});
  if(url.pathname==='/api/alerts/drain'){
   const token=requestObject.headers.get('authorization')||'',expected='Bearer '+service;
   if(!service||token.length!==expected.length||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))return new Response(null,{status:403});
   return Response.json(await drain(),{headers:{'Cache-Control':'no-store'}});
  }
  if(url.pathname!=='/api/alerts/visit')return new Response(null,{status:404});
  if(requestObject.headers.get('origin')!==url.origin)return new Response(null,{status:403});
  if(!service)return new Response(null,{status:503});
  const ip=requestObject.headers.get('cf-connecting-ip');if(!ip)return new Response(null,{status:204});
  // Store an irreversible session key, never the visitor's IP address.
  const key=createHmac('sha256',service).update(ip+'|'+Math.floor(Date.now()/1800000)).digest('hex');
  await database('rpc/record_owner_visit','POST',{visit_key:key});
  return new Response(null,{status:204});
 }
 return {handle,drain};
}
