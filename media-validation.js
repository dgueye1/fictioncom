export async function validateMedia(file,maxSeconds){
 if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type))throw Error('Choose a supported photo or video.');
 if(file.size>10485760)throw Error('Keep each upload under 10 MB.');
 if(!file.type.startsWith('video/'))return;
 const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='metadata';
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Unable to read this video. Try another file.')),15000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve()};video.onerror=()=>{clearTimeout(timer);reject(Error('This video cannot be played. Try MP4 or WebM.'))};video.src=url});if(!Number.isFinite(video.duration)||video.duration<=0)throw Error('Unable to determine video length.');if(video.duration>maxSeconds)throw Error('Videos must be '+(maxSeconds===60?'60 seconds':'5 minutes')+' or shorter.');}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
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
