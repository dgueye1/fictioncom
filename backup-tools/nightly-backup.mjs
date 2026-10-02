import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {encryptBackup,hash} from './backup-crypto.mjs';
const expectedProject='jafxiawuiqkjxrsmqrrt',source='https://'+expectedProject+'.supabase.co';
const required=['PGPASSWORD','SUPABASE_SERVICE_ROLE_KEY'];for(const name of required)if(!process.env[name])throw Error('Missing backup credential: '+name);
if(process.env.PGUSER!=='postgres.'+expectedProject||process.env.PGPORT!=='5432')throw Error('Unexpected backup connection');
const directory=path.resolve('encrypted-backup'),publicKey=await fs.readFile(new URL('./recovery-public.pem',import.meta.url));
await fs.mkdir(directory,{recursive:true,mode:0o700});
const headers={apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
let total=0;const limit=15*1024*1024,manifest={createdAt:new Date().toISOString(),project:expectedProject,format:2,files:[],storage:[],scope:'Logical database including Auth and schema, role definitions without role passwords, and Storage file bytes. Provider settings and encryption root keys are not included. Database dump is transactionally consistent; changing Storage files are detected where possible but not globally atomic.'};
async function save(file,bytes){const encrypted=encryptBackup(bytes,publicKey);total+=encrypted.length;if(total>limit)throw Error('Encrypted backup exceeds the 15 MiB free-storage safety limit');await fs.writeFile(path.join(directory,file),encrypted,{mode:0o600});manifest.files.push({file,bytes:bytes.length,sha256:hash(bytes),encryptedSha256:hash(encrypted)});}
async function json(route,method='GET',body){const r=await fetch(source+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Backup read failed (HTTP '+r.status+')');return r.json();}
async function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{env:{...process.env,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'30',PGOPTIONS:'-c default_transaction_read_only=on'},stdio:['ignore','pipe','pipe']});const buffers=[];let size=0;child.stdout.on('data',chunk=>{size+=chunk.length;if(size>256*1024*1024)child.kill();else buffers.push(chunk);});child.stderr.resume();child.on('error',()=>reject(Error(command+' could not start')));child.on('close',code=>code===0?resolve(Buffer.concat(buffers)):reject(Error(command+' failed; private diagnostic output suppressed')));});}
try{
 await save('database.fcbackup',await run('pg_dump',['--format=custom','--no-password']));
 await save('roles.fcbackup',await run('pg_dumpall',['--roles-only','--no-role-passwords','--no-password']));
 // Storage inventory uses the API to capture files alongside the full database archive.
 async function list(prefix=''){const entries=[];for(let offset=0;;offset+=100){const batch=await json('/storage/v1/object/list/community-media','POST',{prefix,limit:100,offset,sortBy:{column:'name',order:'asc'}});entries.push(...batch);if(batch.length<100)break;}return entries;}
 async function folder(prefix=''){for(const object of await list(prefix)){const name=prefix?prefix+'/'+object.name:object.name;if(!object.id){if(!/^[a-f0-9-]{36}$/i.test(name))throw Error('Unexpected media folder');await folder(name);continue;}if(!/^[a-f0-9-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/i.test(name))throw Error('Unexpected media path');const response=await fetch(source+'/storage/v1/object/authenticated/community-media/'+name,{headers,signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Media changed or could not be read; backup rejected');const bytes=Buffer.from(await response.arrayBuffer()),file='media-'+manifest.storage.length+'.fcbackup';await save(file,bytes);manifest.storage.push({path:name,file,id:object.id,updatedAt:object.updated_at});}}
 await folder();
 // Reject a changing object inventory rather than claiming a complete media snapshot.
 const second=[];async function verifyFolder(prefix=''){for(const object of await list(prefix)){const name=prefix?prefix+'/'+object.name:object.name;if(!object.id)await verifyFolder(name);else second.push({path:name,id:object.id,updatedAt:object.updated_at});}}await verifyFolder();
 const expected=manifest.storage.map(({path,id,updatedAt})=>({path,id,updatedAt}));const sorted=items=>JSON.stringify(items.sort((a,b)=>a.path.localeCompare(b.path)));if(sorted(second)!==sorted(expected))throw Error('Media inventory changed; retry needed');
 await save('manifest.fcbackup',Buffer.from(JSON.stringify(manifest)));
 await fs.writeFile(path.join(directory,'README.txt'),'FictionCom encrypted recovery package. Format FCBACKUP2. Use the separate RSA private key stored in Bitwarden and backup-crypto.mjs to recover files. This key is not in GitHub. Database and media consistency scopes are recorded in the encrypted manifest.\n');
 console.log(JSON.stringify({complete:true,encryptedBytes:total,mediaFiles:manifest.storage.length,createdAt:manifest.createdAt}));
}catch(error){await fs.rm(directory,{recursive:true,force:true});throw error;}finally{delete process.env.PGPASSWORD;delete process.env.SUPABASE_SERVICE_ROLE_KEY;}
