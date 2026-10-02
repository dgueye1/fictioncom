import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
import {launchChecklist} from './launch-checklist.mjs';
export async function launchAccess(request,fetcher=fetch){
 const headers={'Cache-Control':'private, no-store','Vary':'Authorization','Content-Type':'text/html; charset=utf-8'};
 const denied=()=>new Response('Moderator access required.',{status:403,headers});
 if(request.method!=='GET')return new Response(null,{status:405,headers});
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return denied();
 const authHeaders={apikey:SUPABASE_KEY,Authorization:authorization};
 try{
  const auth=await fetcher(SUPABASE_URL+'/auth/v1/user',{headers:authHeaders,signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return denied();const user=await auth.json();
  if(user.app_metadata?.animecom_moderator!==true)return denied();
  const profile=await fetcher(SUPABASE_URL+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&username=eq.dgueye1&select=id',{headers:authHeaders,signal:AbortSignal.timeout(10000)});
  if(!profile.ok||(await profile.json()).length!==1)return denied();
  return new Response(launchChecklist,{headers});
 }catch{return new Response('Checklist unavailable. Please try again.',{status:503,headers});}
}
