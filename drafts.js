const memory=new Map();
const SESSION_PREFIX='fictioncom-draft:';
let connection,storageUnavailable=false;

function openNamed(name){return new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('unavailable'));});}
function openExisting(name){return new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('unavailable'));});}
async function migrateLegacy(db){
 try{if(localStorage.getItem('fictioncom-drafts-migrated'))return;}catch{}
 if(typeof indexedDB.databases!=='function'){try{localStorage.setItem('fictioncom-drafts-migrated','1');}catch{}return;}
 let names=[];
 try{names=await Promise.race([indexedDB.databases(),new Promise(resolve=>setTimeout(()=>resolve(null),1500))]);}catch{names=[];}
 if(!names)return;
 if(!names.some(item=>item.name==='animecom-drafts')){try{localStorage.setItem('fictioncom-drafts-migrated','1');}catch{}return;}
 let legacy;try{legacy=await openExisting('animecom-drafts');}catch{return;}
 if(!legacy.objectStoreNames.contains('drafts')){try{localStorage.setItem('fictioncom-drafts-migrated','1');}catch{}legacy.close();return;}
 const rows=await new Promise((resolve,reject)=>{const tx=legacy.transaction('drafts','readonly'),valuesRequest=tx.objectStore('drafts').getAll(),keysRequest=tx.objectStore('drafts').getAllKeys();let values=[],keys=[];valuesRequest.onsuccess=()=>values=valuesRequest.result||[];keysRequest.onsuccess=()=>keys=keysRequest.result||[];tx.oncomplete=()=>resolve(keys.map((key,index)=>[key,values[index]]));tx.onerror=()=>reject(tx.error);});
 if(rows.length)await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts');for(const [key,value] of rows)store.put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
 try{localStorage.setItem('fictioncom-drafts-migrated','1');}catch{}
 legacy.close();
}
function openDrafts(){
 if(storageUnavailable)return Promise.reject(Error('unavailable'));
 if(connection)return connection;
 connection=(async()=>{const db=await openNamed('fictioncom-drafts');try{await migrateLegacy(db);}catch{}return db;})().catch(error=>{storageUnavailable=true;connection=null;throw error;});
 return connection;
}
async function request(mode,key,value){const db=await openDrafts();return new Promise((resolve,reject)=>{const t=db.transaction('drafts',mode),s=t.objectStore('drafts'),r=mode==='readonly'?s.get(key):value===null?s.delete(key):s.put(value,key);let output;r.onsuccess=()=>output=r.result;t.oncomplete=()=>resolve(output);t.onerror=()=>reject(t.error||Error('unavailable'));t.onabort=()=>reject(t.error||Error('unavailable'));});}
function sessionKey(key){return SESSION_PREFIX+key;}
function rememberSession(key,record){
 try{
  const {files,...rest}=record;
  sessionStorage.setItem(sessionKey(key),JSON.stringify({...rest,fileNames:(files||[]).map(file=>file?.name||'attachment')}));
  return true;
 }catch{return false;}
}
function readSession(key){try{const raw=sessionStorage.getItem(sessionKey(key));return raw?JSON.parse(raw):null;}catch{return null;}}
export async function getDraft(key){
 try{const row=await request('readonly',key);if(row)return row;}catch{}
 if(memory.has(key))return memory.get(key);
 return readSession(key);
}
export async function saveDraft(key,draft){
 const record={...draft,updatedAt:Date.now()};
 memory.set(key,record);
 const sessionOk=rememberSession(key,record);
 const hasFiles=(record.files||[]).some(file=>file?.blob&&file.blob.size);
 try{await request('readwrite',key,record);return 'device';}
 catch{return hasFiles?'window':sessionOk?'tab':'window';}
}
export async function deleteDraft(key){
 memory.delete(key);
 try{sessionStorage.removeItem(sessionKey(key));}catch{}
 try{await request('readwrite',key,null);}catch{}
}
export async function uploadWithProgress({db,url,key,path,file,onProgress}){
 const {data,error}=await db.auth.getSession();if(error)throw error;if(!data.session)throw Error('Sign in again before uploading.');
 const contentType=String(file?.type||'').split(';')[0].trim();
 if(!contentType)throw Error('This file has no type the browser can read. Choose a JPG, PNG, WebP, HEIC, MP4, WebM, or MOV.');
 return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',url+'/storage/v1/object/community-media/'+path.split('/').map(encodeURIComponent).join('/'));xhr.setRequestHeader('apikey',key);xhr.setRequestHeader('Authorization','Bearer '+data.session.access_token);xhr.setRequestHeader('Content-Type',contentType);xhr.setRequestHeader('x-upsert','false');xhr.timeout=180000;xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total);};xhr.onerror=()=>reject(Error('Upload failed. Check your connection and retry; your draft is saved.'));xhr.ontimeout=()=>reject(Error('Upload timed out. Retry when your connection improves; your draft is saved.'));xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){onProgress(1);resolve({path});}else{let payload;try{payload=JSON.parse(xhr.responseText);}catch{}const detail=payload?.message||payload?.error||'';reject(Error(detail?detail+' ('+xhr.status+')':'Upload failed ('+xhr.status+').'));}};xhr.send(file);});
}
export async function deleteUserDrafts(owner){
 for(const key of [...memory.keys()])if(String(key).startsWith(owner+':'))memory.delete(key);
 try{const doomed=[];for(let i=0;i<sessionStorage.length;i++){const name=sessionStorage.key(i);if(name?.startsWith(SESSION_PREFIX+owner+':'))doomed.push(name);}for(const name of doomed)sessionStorage.removeItem(name);}catch{}
 try{const db=await openDrafts();await new Promise((resolve,reject)=>{const t=db.transaction('drafts','readwrite'),r=t.objectStore('drafts').openCursor();r.onsuccess=()=>{const cursor=r.result;if(cursor){if(String(cursor.key).startsWith(owner+':'))cursor.delete();cursor.continue();}};t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}catch{}
}
