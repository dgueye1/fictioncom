// Server-only maintenance. Dry-run by default; --apply removes expired stories.
import {SUPABASE_URL} from './config.js';
import {serverHeaders} from './ai-review-server.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const mode=process.argv[2],apply=process.argv.includes('--apply');
if(!process.env.SUPABASE_SECRET_KEY&&!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Configure the Supabase server key first.');
async function call(route,method='GET',body){const r=await fetch(SUPABASE_URL+route,{method,headers:{...serverHeaders(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Maintenance request failed ('+r.status+').');return r.status===204?null:r.json();}
async function rows(table,filter=''){let all=[],offset=0;while(true){const batch=await call('/rest/v1/'+table+'?select=*&'+filter+'&order=id&offset='+offset+'&limit=500');all.push(...batch);if(batch.length<500)return all;offset+=500;}}
if(mode==='cleanup'){
 const expired=await rows('posts','kind=eq.story&expires_at=lt.'+encodeURIComponent(new Date().toISOString()));
 console.log(JSON.stringify({mode:'cleanup',dryRun:!apply,expiredStories:expired.length}));
 if(apply)for(const p of expired){if(!new RegExp('^'+p.author+'/[a-f0-9-]{36}\\.(jpg|png|webp|mp4|webm)$').test(p.media_path))throw Error('Unexpected story path; cleanup stopped.');await call('/storage/v1/object/community-media','DELETE',{prefixes:[p.media_path]});await call('/rest/v1/posts?id=eq.'+p.id+'&kind=eq.story','DELETE');}
}else if(mode==='export'){
 const appRoot=path.dirname(fileURLToPath(import.meta.url));const directory=path.resolve(process.env.BACKUP_DIRECTORY||path.join(appRoot,'../../work/private-backups'));const relative=path.relative(appRoot,directory);if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Backup directory must be outside the served website.');await mkdir(directory,{recursive:true});
 const data={createdAt:new Date().toISOString(),note:'Application data snapshot; excludes auth credentials, storage bytes and database schema. Not a full disaster-recovery backup.'};
 for(const table of ['profiles','posts','post_media','follows','blocks','comments','likes','post_views','reports','saved_posts','series_follows','notifications','moderation_log','account_requests','support_requests','comment_likes','profile_series','pinned_posts','dismissed_posts','story_interactions','direct_threads','direct_messages','direct_reads','deletion_feedback']){
  // Some relationship tables lack an id; use Range ordering on their natural key.
  const key={direct_reads:'user_id,thread_id',profile_series:'user_id,series,medium,shelf',pinned_posts:'user_id,post_id',dismissed_posts:'user_id,post_id',comment_likes:'user_id,comment_id',follows:'follower,following',blocks:'blocker,blocked',likes:'user_id,post_id',post_views:'user_id,post_id',saved_posts:'user_id,post_id',series_follows:'user_id,medium,series'}[table]||'id';
  let values=[],offset=0;while(true){const batch=await call('/rest/v1/'+table+'?select=*&order='+key+'&offset='+offset+'&limit=500');values.push(...batch);if(batch.length<500)break;offset+=500;}data[table]=values;
 }
 await writeFile(path.join(directory,'animecom-'+Date.now()+'.json'),JSON.stringify(data,null,2),{mode:0o600});console.log('Application snapshot saved in the private backup directory.');
}else throw Error('Usage: maintenance.mjs cleanup [--apply] | export');
