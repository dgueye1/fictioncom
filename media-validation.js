export const MEDIA_LIMIT=10485760;
const ALLOWED=['image/jpeg','image/png','image/webp','video/mp4','video/webm'];
const HEIC_BRANDS=new Set(['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1']);

export function mediaBaseType(type){
 const base=String(type||'').split(';')[0].trim().toLowerCase();
 if(base==='image/jpg'||base==='image/pjpeg')return 'image/jpeg';
 if(base==='image/heif')return 'image/heic';
 return base;
}
function ascii(bytes,start,length){let out='';for(let i=0;i<length;i++)out+=String.fromCharCode(bytes[start+i]||0);return out;}
export async function sniffMedia(file){
 const bytes=new Uint8Array(await file.slice(0,32).arrayBuffer());
 if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
 if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47)return 'image/png';
 if(bytes.length>=12&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP')return 'image/webp';
 if(bytes.length>=4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return 'video/webm';
 if(bytes.length>=12&&ascii(bytes,4,4)==='ftyp'){
  const brand=ascii(bytes,8,4);
  if(HEIC_BRANDS.has(brand))return 'image/heic';
  if(brand==='qt  ')return 'video/quicktime';
  return 'video/mp4';
 }
 return '';
}
function extensionType(name){
 const ext=String(name||'').split('.').pop().toLowerCase();
 return {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heic',mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime',qt:'video/quicktime'}[ext]||'';
}
function videoLike(file,type){return String(type||mediaBaseType(file?.type)||extensionType(file?.name)).startsWith('video/');}
export function mediaLimitMessage(file,type){
 const mb=file.size/1048576,shown=mb.toFixed(mb>=100?0:1);
 return videoLike(file,type)?`Video is ${shown} MB; max 10 MB, try a shorter clip.`:`This file is ${shown} MB; max 10 MB.`;
}
function named(file,type,ext){
 const base=String(file.name||'upload').replace(/\.[^.]+$/,'')||'upload';
 const name=base+'.'+ext;
 if(file.type===type&&file.name===name)return file;
 return new File([file],name,{type,lastModified:file.lastModified});
}
function loadImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('This iPhone photo (HEIC) could not be read. Choose a JPEG, or set Camera → Formats to Most Compatible.'));};image.src=url;});}
async function blobFromCanvas(canvas){
 let quality=.9,blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
 while(blob&&blob.size>MEDIA_LIMIT&&quality>.5){quality=Math.round((quality-.15)*100)/100;blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));}
 if(!blob)throw Error('This iPhone photo could not be converted. Try a JPEG.');
 return blob;
}
async function heicToJpeg(file){
 const typed=mediaBaseType(file.type)==='image/heic'?file:new File([file],file.name||'photo.heic',{type:'image/heic',lastModified:file.lastModified});
 let width,height,draw;
 try{
  const bitmap=await createImageBitmap(typed,{imageOrientation:'from-image'});
  width=bitmap.width;height=bitmap.height;draw=(context,w,h)=>{context.drawImage(bitmap,0,0,w,h);bitmap.close?.();};
 }catch{
  const image=await loadImage(typed);
  width=image.naturalWidth;height=image.naturalHeight;draw=(context,w,h)=>context.drawImage(image,0,0,w,h);
 }
 if(!width||!height)throw Error('This iPhone photo (HEIC) could not be read. Choose a JPEG, or set Camera → Formats to Most Compatible.');
 const scale=Math.min(1,2048/Math.max(width,height)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
 draw(canvas.getContext('2d'),canvas.width,canvas.height);
 const blob=await blobFromCanvas(canvas);
 const jpeg=new File([blob],(String(file.name||'photo').replace(/\.(heic|heif)$/i,'')||'photo')+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
 if(jpeg.size>MEDIA_LIMIT)throw Error(mediaLimitMessage(jpeg,'image/jpeg'));
 return jpeg;
}
function canPlay(file){return new Promise(resolve=>{const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='metadata';video.muted=true;const finish=ok=>{clearTimeout(timer);video.onloadedmetadata=null;video.onerror=null;video.removeAttribute('src');video.load();URL.revokeObjectURL(url);resolve(ok);};const timer=setTimeout(()=>finish(false),8000);video.onloadedmetadata=()=>finish(video.videoWidth>0);video.onerror=()=>finish(false);video.src=url;});}
// iPhone camera videos are video/quicktime (.mov). The bucket does not allow that label.
// Transcoding is not available in the browser, so a clip is stored as video/mp4 only after
// this browser has decoded it. The bytes stay the same, which is what Safari already plays.
async function quicktimeAsMp4(file){
 if(file.size>MEDIA_LIMIT)throw Error(mediaLimitMessage(file,'video/quicktime'));
 const labeled=mediaBaseType(file.type)==='video/quicktime'?file:new File([file],file.name||'video.mov',{type:'video/quicktime',lastModified:file.lastModified});
 if(!await canPlay(labeled))throw Error('This iPhone video cannot be played here. Set Camera → Formats to Most Compatible, or choose a shorter MP4.');
 return named(labeled,'video/mp4','mp4');
}
export async function prepareMediaFile(file){
 if(!file)throw Error('Choose a photo or video.');
 const sniffed=await sniffMedia(file).catch(()=>''),declared=mediaBaseType(file.type);
 if(ALLOWED.includes(declared)&&(!sniffed||sniffed===declared||(declared==='video/mp4'&&sniffed==='video/quicktime'))){
  if(file.size>MEDIA_LIMIT)throw Error(mediaLimitMessage(file,declared));
  return file;
 }
 const type=sniffed||(declared&&declared!=='application/octet-stream'?declared:'')||extensionType(file.name);
 if(!type)throw Error('Choose a JPG, PNG, WebP, HEIC, MP4, WebM, or MOV file.');
 if(type==='image/heic')return heicToJpeg(file);
 if(type==='video/quicktime')return quicktimeAsMp4(file);
 const ext={ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm' }[type];
 if(!ext)throw Error('Choose a JPG, PNG, WebP, HEIC, MP4, WebM, or MOV file.');
 const ready=declared===type?file:named(file,type,ext);
 if(ready.size>MEDIA_LIMIT)throw Error(mediaLimitMessage(ready,type));
 return ready;
}
export async function validateMedia(file,maxSeconds){
 const type=mediaBaseType(file.type);
 if(!type)throw Error('This file has no type the browser can read. Choose a JPG, PNG, WebP, HEIC, MP4, WebM, or MOV.');
 if(type==='image/heic')throw Error('This iPhone photo could not be converted to JPEG. Try another photo.');
 if(type==='video/quicktime')throw Error('This iPhone video could not be prepared. Try a shorter clip, or set Camera → Formats to Most Compatible.');
 if(!ALLOWED.includes(type))throw Error('Choose a JPG, PNG, WebP, HEIC, MP4, WebM, or MOV file.');
 if(file.size>MEDIA_LIMIT)throw Error(mediaLimitMessage(file,type));
 if(!type.startsWith('video/'))return;
 const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='metadata';
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Unable to read this video. Try another file.')),15000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve()};video.onerror=()=>{clearTimeout(timer);reject(Error('This video cannot be played. Try MP4 or a Most Compatible iPhone video.'))};video.src=url});if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Unable to determine video length.');if(video.duration>maxSeconds)throw Error('Videos must be '+(maxSeconds===60?'60 seconds':'5 minutes')+' or shorter.');}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}

// Native file capture has no permission-free hardware probe. Be conservative:
// desktop pickers and browsers without the capture property stay disabled.
export function configureCaptureButtons(photoButton,videoButton,photoInput,videoInput){
 const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 for(const [button,input] of [[photoButton,photoInput],[videoButton,videoInput]]){
  const supported=mobile&&'capture' in input;
  button.disabled=!supported;
  button.title=supported?'':'Camera capture is unavailable in this browser. Choose an existing photo or video instead.';
  if(!supported){let hint=button.parentElement.nextElementSibling;if(!hint?.classList.contains('capture-unavailable')){hint=document.createElement('p');hint.className='small capture-unavailable';hint.textContent='Camera capture is unavailable here. You can still upload photos and videos.';button.parentElement.insertAdjacentElement('afterend',hint);}button.setAttribute('aria-describedby',hint.id||(hint.id=photoButton.id+'-unavailable'));}
 }
}
