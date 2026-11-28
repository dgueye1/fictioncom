const LIMIT=60;
const VIDEO_BPS=1200000;
const AUDIO_BPS=64000;

function mimeType(){
 if(typeof MediaRecorder==='undefined')return '';
 const types=['video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
 return types.find(type=>MediaRecorder.isTypeSupported(type))||'';
}
function mountHost(prefer){
 const root=document.createElement('div');
 root.id='ig-recorder';
 root.className='ig-recorder';
 const modal=prefer?.open?prefer:document.querySelector('#modal');
 if(modal?.open){modal.classList.add('ig-editor-host');modal.append(root);}
 else{root.classList.add('ig-editor-standalone');document.body.append(root);}
 document.body.classList.add('ig-tool-open');
 return {root,modal};
}
function clock(left){
 const seconds=Math.max(0,Math.ceil(left));
 return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}

export function recordClip({host,onDone,onFallback}){
 const mime=mimeType();
 if(!mime||!navigator.mediaDevices?.getUserMedia){onFallback();return;}
 const {root,modal}=mountHost(host);
 const ring=2*Math.PI*42;
 root.innerHTML=`<button type="button" class="ig-editor-close" id="ig-rec-close" aria-label="Close recorder">×</button><video id="ig-rec-preview" autoplay muted playsinline webkit-playsinline></video><div class="ig-rec-hud"><p id="ig-rec-time" aria-live="polite">1:00</p><button type="button" id="ig-rec-button" aria-label="Start recording" aria-pressed="false"><svg class="ig-rec-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff55" stroke-width="4"/><circle id="ig-rec-progress" cx="50" cy="50" r="42" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="${ring.toFixed(2)}" stroke-dashoffset="${ring.toFixed(2)}" transform="rotate(-90 50 50)"/></svg><span></span></button></div>`;
 const preview=root.querySelector('#ig-rec-preview');
 const button=root.querySelector('#ig-rec-button');
 const time=root.querySelector('#ig-rec-time');
 const progress=root.querySelector('#ig-rec-progress');
 preview.muted=true;preview.playsInline=true;
 let stream=null,recorder=null,chunks=[],started=0,raf=0,stopping=false,done=false;
 const close=()=>{
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach(track=>track.stop());
  root.remove();
  modal?.classList.remove('ig-editor-host');
  if(!document.querySelector('#ig-editor'))document.body.classList.remove('ig-tool-open');
 };
 const finish=file=>{if(done)return;done=true;close();if(file)onDone(file);};
 const fallback=()=>{if(done)return;done=true;close();onFallback();};
 root.querySelector('#ig-rec-close').onclick=()=>{
  if(recorder&&recorder.state==='recording')recorder.stop();
  else fallback();
 };
 const stop=()=>{
  if(stopping)return;
  stopping=true;
  cancelAnimationFrame(raf);
  if(recorder&&recorder.state==='recording')recorder.stop();
  else finish(null);
 };
 const tick=now=>{
  const elapsed=Math.min(LIMIT,(now-started)/1000);
  const left=LIMIT-elapsed;
  time.textContent=clock(left);
  progress.style.strokeDashoffset=String(ring*(1-elapsed/LIMIT));
  if(elapsed>=LIMIT){stop();return;}
  raf=requestAnimationFrame(tick);
 };
 button.onclick=()=>{
  if(!recorder)return;
  if(recorder.state==='recording'){stop();return;}
  chunks=[];
  recorder.ondataavailable=event=>{if(event.data&&event.data.size)chunks.push(event.data);};
  recorder.onstop=()=>{
   const type=mime.startsWith('video/mp4')?'video/mp4':'video/webm';
   const file=new File(chunks,`recording-${Date.now()}.${type==='video/mp4'?'mp4':'webm'}`,{type});
   stream?.getTracks().forEach(track=>track.stop());
   stream=null;
   finish(file.size?file:null);
  };
  try{recorder.start();}catch{fallback();return;}
  started=performance.now();
  button.setAttribute('aria-pressed','true');
  button.setAttribute('aria-label','Stop recording');
  root.classList.add('recording');
  raf=requestAnimationFrame(tick);
 };
 const open=async()=>{
  try{
   try{stream=await navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:{ideal:'environment'},width:{ideal:720},height:{ideal:1280}}});}
   catch{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:720},height:{ideal:1280}}});}
  }catch{fallback();return;}
  if(done){stream.getTracks().forEach(track=>track.stop());return;}
  preview.srcObject=stream;
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:VIDEO_BPS,audioBitsPerSecond:AUDIO_BPS});}
  catch{fallback();}
 };
 open();
}
