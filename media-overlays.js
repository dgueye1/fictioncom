export const FONTS={
 classic:{label:'Classic',canvas:"700 32px Georgia, 'Times New Roman', serif"},
 modern:{label:'Modern',canvas:"500 32px 'Avenir Next', Avenir, 'Segoe UI', sans-serif"},
 neon:{label:'Neon',canvas:"700 32px 'Segoe Script', 'Brush Script MT', cursive"},
 typewriter:{label:'Typewriter',canvas:"700 30px 'Courier New', Courier, monospace"},
 strong:{label:'Strong',canvas:"900 34px 'Arial Black', Impact, sans-serif"}
};
export const FONT_ORDER=['classic','modern','neon','typewriter','strong'];
export const SWATCHES=['#ffffff','#000000','#ff2d55','#ff9500','#ffcc00','#34c759','#5ac8fa','#007aff','#af52de','#ff2d92'];
const ALIGN_CYCLE=[{align:'center',highlight:false},{align:'left',highlight:false},{align:'right',highlight:false},{align:'center',highlight:true},{align:'left',highlight:true},{align:'right',highlight:true}];

export function nextTextStyle(item){
 const index=ALIGN_CYCLE.findIndex(style=>style.align===item.align&&style.highlight===item.highlight);
 return ALIGN_CYCLE[(index+1)%ALIGN_CYCLE.length];
}
export function formatDuration(seconds){
 const total=Math.max(0,Math.round(Number(seconds)||0));
 return Math.floor(total/60)+':'+String(total%60).padStart(2,'0');
}
export function frameUrl(url){
 if(!url||url.includes('#t='))return url||'';
 return url+'#t=0.1';
}
function clamp(value,min,max){
 const n=Number(value);
 if(!Number.isFinite(n))return min;
 return Math.min(max,Math.max(min,n));
}
function ink(color){
 const hex=String(color||'#fff').replace('#','');
 const full=hex.length===3?hex.split('').map(c=>c+c).join(''):hex;
 const n=parseInt(full,16);
 if(!Number.isFinite(n))return '#000';
 const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
 return (r*299+g*587+b*114)/1000>160?'#000000':'#ffffff';
}
function cleanStrokes(strokes){
 if(!Array.isArray(strokes))return [];
 return strokes.slice(0,24).map(stroke=>{
  const points=(Array.isArray(stroke?.points)?stroke.points:[]).slice(0,500).map(point=>({x:clamp(point?.x,0,1),y:clamp(point?.y,0,1)})).filter((point,index,all)=>index===0||Math.abs(point.x-all[index-1].x)>0.002||Math.abs(point.y-all[index-1].y)>0.002);
  return {color:/^#[0-9a-fA-F]{3,8}$/.test(stroke?.color||'')?stroke.color:'#ffffff',points};
 }).filter(stroke=>stroke.points.length>1);
}
export function cleanOverlays(list){
 if(!Array.isArray(list))return [];
 return list.slice(0,40).map(item=>{
  const type=['text','emoji','sticker','draw'].includes(item?.type)?item.type:'text';
  const overlay={
   type,
   text:String(item?.text||'').slice(0,240),
   font:FONTS[item?.font]?item.font:'classic',
   color:/^#[0-9a-fA-F]{3,8}$/.test(item?.color||'')?item.color:'#ffffff',
   align:['left','center','right'].includes(item?.align)?item.align:'center',
   highlight:Boolean(item?.highlight),
   x:clamp(item?.x??0.5,0,1),
   y:clamp(item?.y??0.5,0,1),
   scale:clamp(item?.scale??1,0.25,8),
   rotation:clamp(item?.rotation||0,-360,360)
  };
  if(type==='draw')overlay.strokes=cleanStrokes(item?.strokes);
  return overlay;
 }).filter(item=>item.type==='draw'?item.strokes.length:item.text.trim());
}
export function readOverlays(post,path){
 const map=post?.media_overlays;
 if(!map||typeof map!=='object'||Array.isArray(map))return [];
 return cleanOverlays(map[path]);
}
export function overlayHtml(overlays,esc){
 const clean=cleanOverlays(overlays);
 if(!clean.length)return '';
 const draw=clean.filter(item=>item.type==='draw');
 const rest=clean.filter(item=>item.type!=='draw');
 const svg=draw.length?`<svg class="overlay-draw" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${draw.flatMap(item=>item.strokes.map(stroke=>`<polyline fill="none" stroke="${esc(stroke.color)}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" points="${stroke.points.map(point=>(point.x*100).toFixed(2)+','+(point.y*100).toFixed(2)).join(' ')}"/>`)).join('')}</svg>`:'';
 const nodes=rest.map(item=>{
  const textColor=item.highlight?ink(item.color):item.color;
  const bg=item.highlight?`background:${esc(item.color)};`:'';
  const style=`left:${(item.x*100).toFixed(2)}%;top:${(item.y*100).toFixed(2)}%;transform:translate(-50%,-50%) rotate(${item.rotation}deg) scale(${item.scale});color:${esc(textColor)};${bg}`;
  return `<span class="media-overlay font-${item.font} align-${item.align}${item.highlight?' highlight':''}${item.type==='sticker'?' sticker':''}" style="${style}">${esc(item.text)}</span>`;
 }).join('');
 return `<div class="media-overlays">${svg}${nodes}</div>`;
}
function coverDraw(ctx,source,sw,sh,width,height){
 const scale=Math.max(width/sw,height/sh),w=sw*scale,h=sh*scale;
 ctx.drawImage(source,(width-w)/2,(height-h)/2,w,h);
}
export function paintOverlays(ctx,overlays,width,height){
 const clean=cleanOverlays(overlays);
 const px=Math.max(18,width/14);
 for(const item of clean.filter(entry=>entry.type==='draw')){
  for(const stroke of item.strokes){
   ctx.beginPath();
   ctx.strokeStyle=stroke.color;
   ctx.lineWidth=Math.max(3,width/140);
   ctx.lineCap='round';
   ctx.lineJoin='round';
   stroke.points.forEach((point,index)=>{
    const x=point.x*width,y=point.y*height;
    if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
   });
   ctx.stroke();
  }
 }
 for(const item of clean.filter(entry=>entry.type!=='draw')){
  ctx.save();
  ctx.translate(item.x*width,item.y*height);
  ctx.rotate(item.rotation*Math.PI/180);
  ctx.scale(item.scale,item.scale);
  const font=FONTS[item.font]?.canvas||FONTS.classic.canvas;
  ctx.font=font.replace(/\d+px/,Math.round(px)+'px');
  ctx.textAlign=item.align==='left'?'left':item.align==='right'?'right':'center';
  ctx.textBaseline='middle';
  const rows=String(item.text).split('\n').slice(0,8);
  const lineHeight=px*1.2;
  const widest=Math.min(width*0.86,Math.max(...rows.map(row=>ctx.measureText(row).width),px));
  if(item.highlight){
   ctx.fillStyle=item.color;
   const boxW=widest+px*0.7,boxH=rows.length*lineHeight+px*0.35;
   const x=item.align==='left'?-px*0.3:item.align==='right'?-boxW+px*0.3:-boxW/2;
   ctx.fillRect(x,-boxH/2,boxW,boxH);
   ctx.fillStyle=ink(item.color);
  }else ctx.fillStyle=item.color;
  rows.forEach((row,index)=>ctx.fillText(row,0,(index-(rows.length-1)/2)*lineHeight,width*0.86));
  ctx.restore();
 }
}
export async function flattenImage(file,overlays,aspect){
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
 try{
  const width=1080,height=Math.max(1,Math.round(width/aspect));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
  coverDraw(ctx,bitmap,bitmap.width,bitmap.height,width,height);
  paintOverlays(ctx,overlays,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));
  if(!blob)throw Error('Unable to prepare your photo. Try another image.');
  return new File([blob],'photo.jpg',{type:'image/jpeg'});
 }finally{bitmap.close();}
}
export async function framePoster(file,overlays){
 if(!String(file?.type||'').startsWith('video/'))return null;
 const url=URL.createObjectURL(file),video=document.createElement('video');
 video.muted=true;video.playsInline=true;video.preload='auto';
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('timeout')),8000);
   video.onloadeddata=()=>{clearTimeout(timer);resolve();};
   video.onerror=()=>{clearTimeout(timer);reject(Error('unreadable'));};
   video.src=frameUrl(url);
  });
  if(video.duration>0.2){
   await new Promise(resolve=>{
    const timer=setTimeout(resolve,700);
    video.onseeked=()=>{clearTimeout(timer);resolve();};
    try{video.currentTime=Math.min(0.1,video.duration/2);}catch{clearTimeout(timer);resolve();}
   });
  }
  const width=video.videoWidth,height=video.videoHeight;
  if(!width||!height)return null;
  const scale=Math.min(1,960/Math.max(width,height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  if(overlays?.length)paintOverlays(ctx,overlays,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
  return blob&&blob.size?new File([blob],'poster.jpg',{type:'image/jpeg'}):null;
 }catch{return null;}
 finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
export function mountPreviewVideo(video){
 if(!(video instanceof HTMLVideoElement)||video.dataset.frameBound==='1')return;
 video.dataset.frameBound='1';
 video.muted=true;video.defaultMuted=true;video.playsInline=true;
 video.setAttribute('muted','');video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');
 video.preload='metadata';
 const raw=video.getAttribute('src')||'';
 if(raw&&!raw.includes('#t='))video.src=frameUrl(raw);
 const host=()=>video.parentElement;
 const fail=()=>{
  const box=host();
  if(!box||box.querySelector('.media-unplayable'))return;
  video.hidden=true;
  const note=document.createElement('p');
  note.className='media-unplayable';
  note.textContent='This browser can’t play this video.';
  box.append(note);
 };
 const reveal=()=>{
  if(video.error){fail();return;}
  const badge=host()?.querySelector('[data-duration]');
  if(badge&&Number.isFinite(video.duration)&&video.duration>0)badge.textContent=formatDuration(video.duration);
  if(!video.videoWidth||video.currentTime>=0.05||!(video.duration>0.15))return;
  try{video.currentTime=Math.min(0.1,video.duration/2);}catch{}
 };
 video.addEventListener('error',fail);
 video.addEventListener('loadedmetadata',reveal);
 video.addEventListener('durationchange',reveal);
 video.addEventListener('loadeddata',reveal);
 if(video.readyState>=1)reveal();
 video.addEventListener('loadeddata',()=>{
  if(!video.videoWidth)return;
  try{
   const canvas=document.createElement('canvas');
   const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
   canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
   canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
   canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
   const poster=canvas.toDataURL('image/jpeg',0.72);
   if(poster&&poster.length>64&&!video.getAttribute('poster'))video.poster=poster;
  }catch{}
 },{once:true});
}
