// Instagram-style presentation helpers. Data access stays in app.js.
export function igIcon(name){
 const paths={
  heart:'<path d="M12 20.5s-6.8-4.2-6.8-8.6a3.9 3.9 0 0 1 6.8-2.3 3.9 3.9 0 0 1 6.8 2.3c0 4.4-6.8 8.6-6.8 8.6z"/>',
  comment:'<path d="M20.5 12a8.2 8.2 0 0 1-8.2 8.2c-1.2 0-2.3-.2-3.3-.7L4 21.2l1.4-4.1A8.2 8.2 0 1 1 20.5 12z"/>',
  share:'<path d="M21 4 10.8 14.2"/><path d="m21 4-6.8 16.2-3.4-6.8L4 10l17-6z"/>',
  bookmark:'<path d="M7 3.8h10a1 1 0 0 1 1 1V21l-6-3.2L6 21V4.8a1 1 0 0 1 1-1z"/>',
  more:'<circle cx="6" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.25" fill="currentColor" stroke="none"/>',
  mute:'<path d="M11 5 6.5 9H3.5v6h3L11 19V5z"/><path d="m16 9.5 4.5 5M20.5 9.5 16 14.5"/>',
  sound:'<path d="M11 5 6.5 9H3.5v6h3L11 19V5z"/><path d="M15.5 8.5a5.5 5.5 0 0 1 0 7M18.2 6a9 9 0 0 1 0 12"/>',
  play:'<path d="m9 7 9 5-9 5V7z"/>',
  pause:'<path d="M8 6v12M16 6v12"/>',
  chevL:'<path d="m14.5 6-6 6 6 6"/>',
  chevR:'<path d="m9.5 6 6 6-6 6"/>',
  sun:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3.2v1.8M12 19v1.8M4.9 4.9l1.3 1.3M17.8 17.8l1.3 1.3M3.2 12H5M19 12h1.8M4.9 19.1l1.3-1.3M17.8 6.2l1.3-1.3"/>',
  moon:'<path d="M20.5 14.2A7.8 7.8 0 0 1 9.8 3.5 6.4 6.4 0 1 0 20.5 14.2z"/>',
  eye:'<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.4"/>',
  compose:'<path d="M4 17.5V20h2.5L17.2 9.3 14.7 6.8 4 17.5z"/><path d="m13.4 8.1 2.5 2.5"/>'
 };
 return `<svg class="ig-icon" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${paths[name]||''}</svg>`;
}
export function relTime(iso){
 const s=Math.max(0,(Date.now()-Date.parse(iso))/1000);
 if(!Number.isFinite(s))return '';
 if(s<45)return 'Just now';
 if(s<3600)return Math.floor(s/60)+'m';
 if(s<86400)return Math.floor(s/3600)+'h';
 if(s<604800)return Math.floor(s/86400)+'d';
 return new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
export function relTimeLong(iso){
 const s=Math.max(0,(Date.now()-Date.parse(iso))/1000);
 if(s<45)return 'JUST NOW';
 if(s<3600){const n=Math.floor(s/60);return n+' '+(n===1?'MINUTE':'MINUTES')+' AGO';}
 if(s<86400){const n=Math.floor(s/3600);return n+' '+(n===1?'HOUR':'HOURS')+' AGO';}
 if(s<604800){const n=Math.floor(s/86400);return n+' '+(n===1?'DAY':'DAYS')+' AGO';}
 return new Date(iso).toLocaleDateString(undefined,{month:'long',day:'numeric'}).toUpperCase();
}
export function richCaption(text){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return String(text??'').split(/([#@][A-Za-z0-9_]{1,40})/g).map(part=>{
  if(/^#[A-Za-z0-9_]{1,40}$/.test(part))return `<button type="button" class="ig-token" data-hashtag="${esc(part.slice(1))}">${esc(part)}</button>`;
  if(/^@[A-Za-z0-9_]{1,40}$/.test(part))return `<button type="button" class="ig-token" data-mention="${esc(part.slice(1))}">${esc(part)}</button>`;
  return esc(part);
 }).join('');
}
function likeLabel(n){return n===1?'1 like':`${n||0} likes`;}
function slideHtml(item,postId,esc){
 if(item.type==='video')return `<div class="ig-slide"><video class="media" src="${esc(item.url)}" muted playsinline preload="metadata" data-video="${postId}"></video><button type="button" class="ig-mute" aria-label="Unmute video">${igIcon('mute')}</button><span class="ig-play" aria-hidden="true">${igIcon('play')}</span></div>`;
 return `<div class="ig-slide"><img class="media" src="${esc(item.url)}" alt="${esc(item.alt||'Post image')}" loading="lazy"></div>`;
}
export async function buildPostCard(p,api){
 const {esc,signed,storyAvatar,result,db,getUser,community,isRevealed,engagementReady,isPinned}=api;
 const user=getUser();
 const author=p.profiles||{};
 const [stats,liked,saved]=await Promise.all([
  result(db.rpc('post_stats',{target:p.id})),
  user?result(db.from('likes').select('user_id').eq('post_id',p.id).eq('user_id',user.id).maybeSingle()):null,
  user?result(db.from('saved_posts').select('user_id').eq('post_id',p.id).eq('user_id',user.id).maybeSingle()):null
 ]);
 const hidden=community.spoiler(p)&&!isRevealed(p.id);
 let items=[];
 if(!hidden&&p.media_path&&p.kind!=='story'){
  const url=await signed(p.media_path);
  if(url)items.push({url,type:p.media_type==='video'?'video':'image',alt:`Image shared by ${author.display_name||'a member'}`});
  const attachments=await result(db.from('post_media').select('*').eq('post_id',p.id).order('position'));
  for(const a of attachments){const extra=await signed(a.path);if(extra)items.push({url:extra,type:a.media_type==='video'?'video':'image',alt:'Additional post image'});}
 }
 const label=p.series?`${p.series}${p.kind==='reaction'&&p.episode?` · ${p.medium==='manga'?'Chapter':'Episode'} ${p.episode}`:''}`:'';
 const body=p.body||'';
 const trimmed=body.length>320?body.slice(0,320).trimEnd()+'…':body;
 const picture=await storyAvatar(author);
 const menu=[];
 if(engagementReady&&p.suggested)menu.push(`<button type="button" data-dismiss="${p.id}">Not interested</button>`);
 if(engagementReady&&p.author===user?.id&&p.status==='approved'&&!['story','avatar'].includes(p.kind))menu.push(`<button type="button" data-pin="${p.id}">${isPinned(p.id)?'Unpin from profile':'Pin to profile'}</button>`);
 if(p.author===user?.id&&p.media_path&&p.status==='pending')menu.push(`<button type="button" data-ai-review="${p.id}">Finish upload</button>`);
 if(p.author===user?.id){
  if(!['story','avatar'].includes(p.kind)&&p.status==='approved')menu.push(`<button type="button" data-edit-post="${p.id}">Edit</button>`);
  menu.push(`<button type="button" data-delete="${p.id}">Delete</button>`);
  if(p.kind==='story')menu.push(`<button type="button" data-viewers="${p.id}">Viewers</button>`);
 }else menu.push(`<button type="button" data-report="${p.id}">Report</button>`);
 const sub=label?`<button type="button" class="text-button ig-series" data-series="${esc(p.series)}" data-medium="${p.medium||''}">${esc(label)}</button>`:`<span>@${esc(author.username||'member')}</span>`;
 const n=items.length;
 const frame=n?`<div class="ig-frame" data-carousel>${n>1?`<button type="button" class="ig-arrow ig-prev" aria-label="Previous photo" hidden>${igIcon('chevL')}</button><button type="button" class="ig-arrow ig-next" aria-label="Next photo">${igIcon('chevR')}</button><span class="ig-index">1/${n}</span>`:''}<div class="media-carousel">${items.map(item=>slideHtml(item,p.id,esc)).join('')}</div></div>${n>1?`<div class="ig-dots">${items.map((_,i)=>`<button type="button" class="ig-dot${i?'':' on'}" data-dot="${i}" aria-label="Photo ${i+1} of ${n}"></button>`).join('')}</div>`:''}`:'';
 const caption=`<div class="ig-foot"><p class="ig-like-count" data-like-count="${p.id}" ${stats.likes?'':'hidden'}>${likeLabel(stats.likes||0)}</p>${p.title?`<p class="ig-title">${esc(p.title)}</p>`:''}<p class="ig-caption"><button type="button" data-person="${p.author}" class="ig-name">${esc(author.display_name||'Member')}</button> <span class="post-copy" data-copy="${p.id}">${richCaption(trimmed)}</span></p>${body.length>320?`<button type="button" class="text-button" data-expand="${p.id}" aria-expanded="false">more</button>`:''}${stats.comments?`<button type="button" class="ig-comments-link" data-comments="${p.id}">View all ${stats.comments} comment${stats.comments===1?'':'s'}</button>`:`<button type="button" class="ig-comments-link" data-comments="${p.id}">Add a comment</button>`}<time class="ig-time" datetime="${esc(p.created_at)}">${relTimeLong(p.created_at)}</time>${p.suggested?'<p class="small ig-suggested">Suggested for you</p>':''}</div>`;
 const spoiler=`<div class="ig-frame ig-spoiler-frame"><div class="spoiler ig-spoiler"><strong>Spoilers ahead</strong><p>${esc(label||'This post')}</p><button type="button" data-reveal="${p.id}">See post</button></div></div>`;
 const actionRow=`<div class="actions ig-actions"><button type="button" data-like="${p.id}" class="ig-action${liked?' liked':''}" aria-label="${liked?'Unlike':'Like'}" aria-pressed="${liked?'true':'false'}">${igIcon('heart')}</button><button type="button" data-comments="${p.id}" class="ig-action" aria-label="Comment">${igIcon('comment')}</button><button type="button" data-share="${p.id}" class="ig-action" aria-label="Share">${igIcon('share')}</button><button type="button" data-save="${p.id}" class="ig-action ig-save${saved?' saved':''}" aria-label="${saved?'Unsave':'Save'}" aria-pressed="${saved?'true':'false'}">${igIcon('bookmark')}</button></div>`;
 const below=hidden?'':p.kind==='story'?`<div class="ig-foot"><button type="button" data-story="${p.id}" class="primary">Watch story</button><p class="small">Expires ${esc(new Date(p.expires_at).toLocaleString())}</p></div>`:caption;
 const visual=hidden?spoiler:frame;
 const ordered=(hidden||n)?visual+actionRow+below:below+actionRow;
 return `<article class="post ig-post social-post" data-post="${p.id}"><header class="post-head ig-head">${picture}<div class="ig-author"><button type="button" data-person="${p.author}"><strong>${esc(author.display_name||'Member')}</strong></button><div class="ig-sub">${sub}</div></div><button type="button" class="ig-more" data-more aria-label="More options" aria-expanded="false">${igIcon('more')}</button><div class="ig-menu" hidden>${menu.join('')}</div></header>${p.status!=='approved'?`<p class="status">${p.status==='pending'?'Upload incomplete · only visible to you':'Upload removed · only visible to you'}</p>`:''}${ordered}</article>`;
}
export function bindPostMedia(root=document){
 root.querySelectorAll('.ig-frame[data-carousel]').forEach(frame=>{
  if(frame.dataset.bound)return;frame.dataset.bound='1';
  const scroller=frame.querySelector('.media-carousel');
  const slides=[...scroller.children];
  const badge=frame.querySelector('.ig-index');
  const dotWrap=frame.nextElementSibling?.classList.contains('ig-dots')?frame.nextElementSibling:null;
  const dots=dotWrap?[...dotWrap.children]:[];
  const prev=frame.querySelector('.ig-prev'),next=frame.querySelector('.ig-next');
  const sync=()=>{const i=Math.round(scroller.scrollLeft/Math.max(scroller.clientWidth,1));if(badge)badge.textContent=`${i+1}/${slides.length}`;dots.forEach((d,n)=>d.classList.toggle('on',n===i));if(prev)prev.hidden=i<=0;if(next)next.hidden=i>=slides.length-1;};
  scroller.addEventListener('scroll',sync,{passive:true});
  if(prev)prev.onclick=e=>{e.stopPropagation();scroller.scrollBy({left:-scroller.clientWidth,behavior:'smooth'});};
  if(next)next.onclick=e=>{e.stopPropagation();scroller.scrollBy({left:scroller.clientWidth,behavior:'smooth'});};
  dots.forEach(d=>d.onclick=e=>{e.stopPropagation();slides[Number(d.dataset.dot)]?.scrollIntoView({behavior:'smooth',inline:'start',block:'nearest'});});
  frame.querySelectorAll('.ig-mute').forEach(btn=>{const video=btn.parentElement.querySelector('video');btn.onclick=e=>{e.stopPropagation();if(!video)return;video.muted=!video.muted;btn.innerHTML=igIcon(video.muted?'mute':'sound');btn.setAttribute('aria-label',video.muted?'Unmute video':'Mute video');};});
  frame.querySelectorAll('video').forEach(video=>{const slide=video.parentElement;const paint=()=>slide.classList.toggle('is-playing',!video.paused);video.addEventListener('play',paint);video.addEventListener('pause',paint);});
  slides.forEach(slide=>{const img=slide.querySelector('img');if(img&&!img.complete)img.addEventListener('load',()=>{if(img.naturalWidth>=img.naturalHeight)frame.classList.add('is-square');},{once:true});else if(img?.naturalWidth>=img?.naturalHeight)frame.classList.add('is-square');});
  let last=0,timer=0;
  frame.addEventListener('click',e=>{
   if(e.target.closest('.ig-arrow,.ig-mute,.ig-dot,button'))return;
   const now=Date.now();
   if(now-last<300){clearTimeout(timer);last=0;burst(frame);const like=frame.closest('article,dialog')?.querySelector('.ig-action[data-like]');if(like&&!like.classList.contains('liked'))like.click();return;}
   last=now;
   const slide=e.target.closest('.ig-slide')||slides[Math.round(scroller.scrollLeft/Math.max(scroller.clientWidth,1))];
   const video=slide?.querySelector('video');
   timer=setTimeout(()=>{if(video){if(video.paused)video.play().catch(()=>{});else video.pause();}else openLightbox(frame,scroller);},280);
  });
 });
}
function burst(frame){const heart=document.createElement('span');heart.className='ig-burst';heart.innerHTML=igIcon('heart');frame.append(heart);setTimeout(()=>heart.remove(),720);}
export function openLightbox(frame,scroller){
 let dlg=document.querySelector('#lightbox');
 if(!dlg){dlg=document.createElement('dialog');dlg.id='lightbox';dlg.className='ig-lightbox';dlg.innerHTML='<button type="button" id="close-lightbox" class="close" aria-label="Close photo">×</button><div id="lightbox-stage"></div>';document.body.append(dlg);dlg.querySelector('#close-lightbox').onclick=()=>dlg.close();}
 const stage=dlg.querySelector('#lightbox-stage');
 const slides=[...frame.querySelectorAll('.ig-slide')];
 stage.innerHTML=`<div class="ig-lightbox-track">${slides.map(s=>{const v=s.querySelector('video'),img=s.querySelector('img');if(v)return `<div class="ig-lightbox-slide"><video src="${escapeAttr(v.currentSrc||v.src)}" controls playsinline></video></div>`;if(img)return `<div class="ig-lightbox-slide"><img src="${escapeAttr(img.src)}" alt="${escapeAttr(img.alt||'Post image')}"></div>`;return '';}).join('')}</div>`;
 if(!dlg.open)dlg.showModal();
 document.documentElement.classList.add('modal-open');
 const index=Math.round((scroller?.scrollLeft||0)/Math.max(scroller?.clientWidth||1,1));
 requestAnimationFrame(()=>{const track=stage.querySelector('.ig-lightbox-track');if(track)track.scrollLeft=index*track.clientWidth;});
}
function escapeAttr(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function bindStoryGestures(stage,{next,previous,togglePause,isPaused,isCurrent}){
 let holdTimer=0,held=false,suppress=false,moved=false,start=null;
 const cancelHold=()=>{clearTimeout(holdTimer);holdTimer=0;};
 stage.addEventListener('pointerdown',e=>{
  if(e.button===2||e.target.closest('button,a,input,textarea,form'))return;
  start={x:e.clientX,y:e.clientY};held=false;moved=false;
  holdTimer=setTimeout(()=>{suppress=true;if(!isPaused()){held=true;togglePause();}},220);
 });
 stage.addEventListener('pointermove',e=>{if(!start)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>12){moved=true;cancelHold();}});
 stage.addEventListener('pointerup',()=>{cancelHold();if(held&&isPaused())togglePause();held=false;start=null;});
 stage.addEventListener('pointercancel',()=>{cancelHold();held=false;start=null;});
 stage.addEventListener('click',e=>{
  if(suppress||moved){suppress=false;moved=false;return;}
  if(e.target.closest('button,a,input,textarea,form'))return;
  const rect=stage.getBoundingClientRect();
  if(e.clientX-rect.left<rect.width*0.33)previous();else next();
 });
 const onKey=e=>{
  if(!isCurrent()){document.removeEventListener('keydown',onKey);return;}
  if(e.target.closest('input,textarea,select'))return;
  if(e.key==='ArrowRight'){e.preventDefault();next();}
  else if(e.key==='ArrowLeft'){e.preventDefault();previous();}
  else if(e.key===' '||e.code==='Space'){e.preventDefault();togglePause();}
 };
 document.addEventListener('keydown',onKey);
}
