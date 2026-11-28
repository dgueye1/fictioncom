export function mediaBaseType(type){
 const base=String(type||'').split(';')[0].trim().toLowerCase();
 return base==='image/jpg'?'image/jpeg':base;
}
const KNOWN=['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'];
const EXT={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
export function coerceMediaFile(file){
 if(!file)return file;
 const base=mediaBaseType(file.type);
 if(KNOWN.includes(base))return file.type===base?file:new File([file],file.name||'upload',{type:base,lastModified:file.lastModified});
 const ext=String(file.name||'').split('.').pop().toLowerCase();
 const type=EXT[ext];
 if(!type)return file;
 return new File([file],file.name||('upload.'+ext),{type,lastModified:file.lastModified});
}
export async function validateMedia(file,maxSeconds){
 const type=mediaBaseType(file.type);
 if(!KNOWN.includes(type))throw Error('Choose a JPG, PNG, WebP, MP4, MOV, or WebM file.');
 if(file.size>10485760)throw Error('Keep each upload under 10 MB.');
 if(!type.startsWith('video/'))return;
 const url=URL.createObjectURL(file),video=document.createElement('video');
 video.muted=true;video.playsInline=true;video.preload='metadata';
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Unable to read this video. Try another file.')),15000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve()};video.onerror=()=>{clearTimeout(timer);reject(Error('This video cannot be played. Try MP4, MOV, or WebM.'))};video.src=url+'#t=0.1'});if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Unable to determine video length.');if(video.duration>maxSeconds+0.05)throw Error(maxSeconds<=60?"Please upload a video that's 60 seconds or shorter.":'Videos must be 5 minutes or shorter.');}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
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
