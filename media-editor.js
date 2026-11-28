import {cleanOverlays,flattenImage,FONTS,FONT_ORDER,frameUrl,mountPreviewVideo,nextTextStyle,overlayHtml,SWATCHES} from './media-overlays.js';

const EMOJIS=[['😀','grin'],['😁','smile'],['😂','joy'],['🤣','rofl'],['😊','blush'],['😍','love'],['😘','kiss'],['😎','cool'],['🤩','star struck'],['😢','cry'],['😭','sob'],['😡','angry'],['🤔','think'],['😴','sleep'],['🙄','roll'],['😇','angel'],['🥳','party'],['🤯','mind blown'],['🥺','pleading'],['😏','smirk'],['❤️','heart'],['🧡','orange heart'],['💛','yellow heart'],['💚','green heart'],['💙','blue heart'],['💜','purple heart'],['🖤','black heart'],['💔','broken heart'],['🔥','fire'],['✨','sparkles'],['⭐','star'],['🌟','glow'],['💯','hundred'],['👍','thumbs up'],['👏','clap'],['🙌','raise'],['👀','eyes'],['💀','skull'],['🎉','tada'],['🌸','blossom'],['🌹','rose'],['🍀','clover'],['🌙','moon'],['☀️','sun'],['⚡','zap'],['🎵','music'],['🎶','notes'],['📚','books'],['📖','book'],['✏️','pencil'],['📺','tv'],['🎬','film'],['🎮','game'],['🍜','noodles'],['🍣','sushi'],['☕','coffee'],['🍰','cake'],['🐱','cat'],['🐶','dog'],['🐰','rabbit'],['🦊','fox'],['🐼','panda'],['🦋','butterfly'],['🌈','rainbow'],['💫','dizzy'],['✅','check'],['❌','cross'],['❓','question'],['❗','exclaim']];

function esc(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function hostFor(){
 const modal=document.querySelector('#modal');
 const root=document.createElement('div');
 root.id='ig-editor';
 root.className='ig-editor';
 if(modal?.open){modal.classList.add('ig-editor-host');modal.append(root);}
 else{root.classList.add('ig-editor-standalone');document.body.append(root);}
 document.body.classList.add('ig-tool-open');
 return {root,modal};
}
function stickerChoices({username,series}){
 const stickers=[];
 const time=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 stickers.push({label:'Time',text:time});
 if(username)stickers.push({label:'Mention',text:'@'+username.replace(/^@/,'')});
 const tag=String(series||'').trim();
 if(tag){
  stickers.push({label:'Hashtag',text:'#'+tag.replace(/[^\p{L}\p{N}_]+/gu,'')});
  stickers.push({label:tag,text:tag});
 }
 return stickers.filter(item=>item.text);
}

export function openMediaEditor({file,purpose='post',username='',series=''}){
 const story=purpose==='story';
 return new Promise(resolve=>{
  const {root,modal}=hostFor();
  const url=URL.createObjectURL(file);
  const video=String(file.type||'').startsWith('video/');
  let overlays=[],selected=-1,closed=false,drawing=false,stroke=null,pointers=new Map(),pinch=null,drag=null,textDraft=null;
  const finish=value=>{
   if(closed)return;
   closed=true;
   URL.revokeObjectURL(url);
   root.remove();
   modal?.classList.remove('ig-editor-host');
   if(!document.querySelector('#ig-recorder'))document.body.classList.remove('ig-tool-open');
   resolve(value);
  };
  root.innerHTML=`<div class="ig-editor-stage" id="ig-stage">${video?`<video class="ig-editor-media" muted playsinline webkit-playsinline preload="metadata" src="${esc(frameUrl(url))}"></video>`:`<img class="ig-editor-media" alt="" src="${esc(url)}">`}<div id="ig-overlay-mount"></div><p class="media-unplayable" id="ig-unplayable" hidden>This browser can’t play this video.</p><div class="ig-editor-trash" id="ig-trash" hidden aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Z"/></svg></div></div><button type="button" class="ig-editor-close" id="ig-editor-close" aria-label="Close editor">×</button><div class="ig-editor-rail" role="toolbar" aria-label="Edit tools"><button type="button" id="ig-tool-text" aria-label="Add text">Aa</button><button type="button" id="ig-tool-sticker" aria-label="Add sticker or emoji">☺</button><button type="button" id="ig-tool-draw" aria-label="Draw" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M4 20h4l11-11-4-4L4 16v4Z"/></svg></button></div><div class="ig-text-mode" id="ig-text-mode" hidden><textarea id="ig-text-input" maxlength="240" placeholder="Type something…" aria-label="Text"></textarea><div class="ig-text-tools"><button type="button" id="ig-font" aria-label="Change font">Classic</button><div class="ig-swatches" role="listbox" aria-label="Text color">${SWATCHES.map(color=>`<button type="button" class="ig-swatch${color==='#ffffff'?' on':''}" data-color="${color}" style="background:${color}" aria-label="Color ${color}"></button>`).join('')}</div><button type="button" id="ig-align" aria-label="Alignment and background">≡</button><button type="button" id="ig-text-done" class="primary">Done</button></div></div><div class="ig-sticker-sheet" id="ig-sticker-sheet" hidden><div class="ig-sheet-bar"><input id="ig-emoji-search" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off"><button type="button" id="ig-sheet-close" aria-label="Close stickers">×</button></div><div id="ig-sticker-picks" class="ig-sticker-picks"></div><div id="ig-emoji-grid" class="ig-emoji-grid"></div></div><div class="ig-draw-bar" id="ig-draw-bar" hidden><div class="ig-swatches">${SWATCHES.map(color=>`<button type="button" class="ig-swatch${color==='#ffffff'?' on':''}" data-pen="${color}" style="background:${color}" aria-label="Pen ${color}"></button>`).join('')}</div><button type="button" id="ig-undo" class="quiet">Undo</button></div>${story?`<div class="ig-story-meta"><label class="check"><input id="ig-rules" type="checkbox"> I confirm this follows the no-nudity and community rules.</label><details><summary>Spoiler label</summary><label>Series<input id="ig-series" maxlength="100" value="${esc(series)}"></label><label>Format<select id="ig-medium"><option value="anime">Anime</option><option value="manga">Manga</option></select></label><label>Episode / chapter<input id="ig-episode" type="number" min="1" max="100000"></label><label class="check"><input id="ig-spoiler" type="checkbox"> Contains spoilers</label></details><p id="ig-editor-error" class="error" role="alert"></p></div>`:''}<button type="button" class="ig-editor-next" id="ig-next">${story?'Share':'Next'}</button>`;
  const stage=root.querySelector('#ig-stage');
  const mount=root.querySelector('#ig-overlay-mount');
  const media=root.querySelector('.ig-editor-media');
  if(video){
   mountPreviewVideo(media);
   media.addEventListener('error',()=>{root.querySelector('#ig-unplayable').hidden=false;});
  }
  let font='classic',color='#ffffff',align='center',highlight=false,pen='#ffffff';
  const paint=()=>{mount.innerHTML=overlayHtml(overlays,esc);bindOverlays();};
  const nodeFor=item=>{
   const visible=overlays.filter(entry=>entry.type!=='draw');
   return mount.querySelectorAll('.media-overlay')[visible.indexOf(item)]||null;
  };
  const place=item=>{
   const node=nodeFor(item);
   if(!node)return;
   node.style.left=(item.x*100).toFixed(2)+'%';
   node.style.top=(item.y*100).toFixed(2)+'%';
   node.style.transform=`translate(-50%,-50%) rotate(${item.rotation}deg) scale(${item.scale})`;
  };
  const selectStyle=item=>{
   font=item?.font||font;color=item?.color||color;align=item?.align||'center';highlight=Boolean(item?.highlight);
   root.querySelector('#ig-font').textContent=FONTS[font].label;
   root.querySelectorAll('#ig-text-mode .ig-swatch').forEach(button=>button.classList.toggle('on',button.dataset.color===color));
  };
  function bindOverlays(){
   [...mount.querySelectorAll('.media-overlay')].forEach((node,index)=>{
    const real=overlays.filter(item=>item.type!=='draw')[index];
    const at=overlays.indexOf(real);
    node.addEventListener('pointerdown',event=>{
     if(drawing||(event.button!=null&&event.button!==0))return;
     event.stopPropagation();
     selected=at;
     node.setPointerCapture?.(event.pointerId);
     pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
     const now=Date.now();
     drag={id:event.pointerId,moved:false,item:real,tapped:now-(real._tap||0)<320};
     real._tap=now;
     root.querySelector('#ig-trash').hidden=false;
    });
   });
  }
  function openText(item){
   textDraft=item||null;
   const mode=root.querySelector('#ig-text-mode');
   mode.hidden=false;
   const input=root.querySelector('#ig-text-input');
   input.value=item?.text||'';
   selectStyle(item||{font,color,align,highlight});
   input.focus();
  }
  function closeText(save){
   const mode=root.querySelector('#ig-text-mode');
   const value=root.querySelector('#ig-text-input').value.trim();
   mode.hidden=true;
   if(!save){textDraft=null;return;}
   if(textDraft){
    textDraft.text=value;textDraft.font=font;textDraft.color=color;textDraft.align=align;textDraft.highlight=highlight;
    if(!value)overlays=overlays.filter(item=>item!==textDraft);
   }else if(value){const place=slot();overlays.push({type:'text',text:value,font,color,align,highlight,x:place.x,y:place.y,scale:1,rotation:0});}
   textDraft=null;
   paint();
  }
  root.querySelector('#ig-tool-text').onclick=()=>{drawing=false;root.classList.remove('drawing');root.querySelector('#ig-draw-bar').hidden=true;root.querySelector('#ig-tool-draw').setAttribute('aria-pressed','false');openText(null);};
  root.querySelector('#ig-font').onclick=()=>{const index=FONT_ORDER.indexOf(font);font=FONT_ORDER[(index+1)%FONT_ORDER.length];root.querySelector('#ig-font').textContent=FONTS[font].label;root.querySelector('#ig-font').style.fontFamily=font==='typewriter'?'Courier New, monospace':font==='neon'?'Segoe Script, cursive':font==='strong'?'Arial Black, Impact, sans-serif':font==='modern'?'Avenir Next, sans-serif':'Georgia, serif';};
  root.querySelectorAll('#ig-text-mode [data-color]').forEach(button=>button.onclick=()=>{color=button.dataset.color;root.querySelectorAll('#ig-text-mode .ig-swatch').forEach(item=>item.classList.toggle('on',item===button));});
  root.querySelector('#ig-align').onclick=()=>{const next=nextTextStyle({align,highlight});align=next.align;highlight=next.highlight;root.querySelector('#ig-align').setAttribute('aria-pressed',String(highlight));};
  const slot=()=>{const n=overlays.filter(item=>item.type!=='draw').length;return {x:n%2?0.62:0.38,y:Math.min(0.78,0.32+n*0.18)};};
  root.querySelector('#ig-text-done').onclick=()=>closeText(true);
  const picks=stickerChoices({username,series:series||root.querySelector('#ig-series')?.value});
  root.querySelector('#ig-sticker-picks').innerHTML=picks.length?picks.map((item,index)=>`<button type="button" data-sticker="${index}">${esc(item.text)}</button>`).join(''):'<p class="small">Series stickers show up when a series is set.</p>';
  const grid=root.querySelector('#ig-emoji-grid');
  const renderEmoji=query=>{
   const q=query.trim().toLowerCase();
   grid.innerHTML=EMOJIS.filter(([,name])=>!q||name.includes(q)).map(([emoji,name])=>`<button type="button" data-emoji="${emoji}" aria-label="${esc(name)}">${emoji}</button>`).join('')||'<p class="small">No emoji matches.</p>';
   grid.querySelectorAll('[data-emoji]').forEach(button=>button.onclick=()=>{const place=slot();overlays.push({type:'emoji',text:button.dataset.emoji,font:'classic',color:'#ffffff',align:'center',highlight:false,x:place.x,y:place.y,scale:1.6,rotation:0});root.querySelector('#ig-sticker-sheet').hidden=true;paint();});
  };
  renderEmoji('');
  root.querySelector('#ig-emoji-search').oninput=event=>renderEmoji(event.target.value);
  root.querySelectorAll('[data-sticker]').forEach(button=>button.onclick=()=>{
   const item=picks[Number(button.dataset.sticker)];
   const place=slot();overlays.push({type:'sticker',text:item.text,font:'strong',color:'#ffffff',align:'center',highlight:true,x:place.x,y:place.y,scale:1,rotation:0});
   root.querySelector('#ig-sticker-sheet').hidden=true;
   paint();
  });
  root.querySelector('#ig-tool-sticker').onclick=()=>{root.querySelector('#ig-text-mode').hidden=true;root.querySelector('#ig-sticker-sheet').hidden=false;root.querySelector('#ig-emoji-search').focus();};
  root.querySelector('#ig-sheet-close').onclick=()=>{root.querySelector('#ig-sticker-sheet').hidden=true;};
  root.querySelector('#ig-tool-draw').onclick=()=>{
   drawing=!drawing;
   root.classList.toggle('drawing',drawing);
   root.querySelector('#ig-draw-bar').hidden=!drawing;
   root.querySelector('#ig-tool-draw').setAttribute('aria-pressed',String(drawing));
   root.querySelector('#ig-text-mode').hidden=true;
   root.querySelector('#ig-sticker-sheet').hidden=true;
  };
  root.querySelectorAll('[data-pen]').forEach(button=>button.onclick=()=>{pen=button.dataset.pen;root.querySelectorAll('[data-pen]').forEach(item=>item.classList.toggle('on',item===button));});
  root.querySelector('#ig-undo').onclick=()=>{
   const draw=overlays.findLast?.(item=>item.type==='draw')||[...overlays].reverse().find(item=>item.type==='draw');
   if(!draw)return;
   draw.strokes.pop();
   if(!draw.strokes.length)overlays=overlays.filter(item=>item!==draw);
   paint();
  };
  const localPoint=event=>{
   const rect=stage.getBoundingClientRect();
   return {x:Math.min(1,Math.max(0,(event.clientX-rect.left)/Math.max(rect.width,1))),y:Math.min(1,Math.max(0,(event.clientY-rect.top)/Math.max(rect.height,1)))};
  };
  stage.addEventListener('pointerdown',event=>{
   if(!drawing||event.target.closest('button'))return;
   const draw=overlays.find(item=>item.type==='draw')||(overlays.push({type:'draw',strokes:[],text:'',x:0,y:0,scale:1,rotation:0}),overlays[overlays.length-1]);
   stroke={color:pen,points:[localPoint(event)]};
   draw.strokes.push(stroke);
   stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointermove',event=>{
   if(stroke&&drawing){
    stroke.points.push(localPoint(event));
    if(stroke.points.length%2===0)paint();
    return;
   }
   if(!pointers.has(event.pointerId))return;
   pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
   const item=overlays[selected];
   if(!item||item.type==='draw')return;
   if(pointers.size>=2){
    const [a,b]=[...pointers.values()];
    const dist=Math.hypot(a.x-b.x,a.y-b.y)||1;
    const angle=Math.atan2(b.y-a.y,b.x-a.x);
    if(!pinch)pinch={dist,angle,scale:item.scale,rotation:item.rotation};
    item.scale=Math.min(8,Math.max(0.25,pinch.scale*(dist/pinch.dist)));
    item.rotation=pinch.rotation+(angle-pinch.angle)*180/Math.PI;
   }else{
    const point=localPoint(event);
    const dx=Math.abs(point.x-item.x),dy=Math.abs(point.y-item.y);
    if(dx>0.03||dy>0.03)drag.moved=true;
    item.x=point.x;item.y=point.y;
   }
   const trash=root.querySelector('#ig-trash').getBoundingClientRect();
   root.querySelector('#ig-trash').classList.toggle('hot',event.clientX>=trash.left&&event.clientX<=trash.right&&event.clientY>=trash.top&&event.clientY<=trash.bottom);
   place(item);
  });
  const endPointer=event=>{
   pointers.delete(event.pointerId);
   if(pointers.size<2)pinch=null;
   if(stroke){stroke=null;paint();}
   const item=overlays[selected];
   const trash=root.querySelector('#ig-trash');
   let removed=false;
   if(item&&drag?.moved&&pointers.size===0){
    const box=trash.getBoundingClientRect();
    if(event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom){overlays=overlays.filter(entry=>entry!==item);removed=true;}
   }else if(item?.type==='text'&&drag?.tapped&&!drag.moved&&pointers.size===0)openText(item);
   if(!pointers.size){drag=null;trash.hidden=true;trash.classList.remove('hot');if(removed||stroke)paint();}
  };
  stage.addEventListener('pointerup',endPointer);
  stage.addEventListener('pointercancel',endPointer);
  root.querySelector('#ig-editor-close').onclick=()=>finish(null);
  root.querySelector('#ig-next').onclick=async()=>{
   const button=root.querySelector('#ig-next');
   if(story){
    const error=root.querySelector('#ig-editor-error');
    const spoiler=root.querySelector('#ig-spoiler').checked;
    const storySeries=root.querySelector('#ig-series').value.trim();
    const episode=Number(root.querySelector('#ig-episode').value)||null;
    if(!root.querySelector('#ig-rules').checked){error.textContent='Confirm the community rules before sharing.';return;}
    if(spoiler&&(!storySeries||!episode)){error.textContent='Add a series and episode/chapter for the spoiler label.';return;}
    button.disabled=true;
    try{
     const nextFile=video?file:await flattenImage(file,overlays,9/16);
     finish({file:nextFile,overlays:video?cleanOverlays(overlays):[],series:storySeries,medium:root.querySelector('#ig-medium').value,episode,spoiler});
    }catch(err){button.disabled=false;error.textContent=err.message||'Unable to prepare this story.';}
    return;
   }
   button.disabled=true;
   try{
    const nextFile=video?file:await flattenImage(file,overlays,4/5);
    finish({file:nextFile,overlays:video?cleanOverlays(overlays):[]});
   }catch(err){button.disabled=false;root.querySelector('#ig-next').insertAdjacentHTML('beforebegin',`<p class="error">${esc(err.message||'Unable to prepare this photo.')}</p>`);}
  };
  paint();
 });
}
