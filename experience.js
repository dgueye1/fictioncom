const SIGNED_SECONDS=3600;
const CACHE_MS=50*60*1000;

function unwrapStats(stats){
  if(!stats||typeof stats!=='object')return null;
  if(stats.likes!=null||stats.views!=null||stats.comments!=null||stats.shares!=null)return stats;
  const values=Object.values(stats);
  if(values.length===1&&values[0]&&typeof values[0]==='object')return unwrapStats(values[0]);
  return null;
}

export function createExperience({db,result,esc,getUser}){
  const cache=new Map();

  async function signed(path){
    if(!path)return null;
    const hit=cache.get(path);
    if(hit&&hit.exp>Date.now())return hit.url;
    try{
      const out=await result(db.storage.from('community-media').createSignedUrl(path,SIGNED_SECONDS));
      const url=out?.signedUrl||out?.signedURL||null;
      if(url)cache.set(path,{url,exp:Date.now()+CACHE_MS});
      return url;
    }catch{return null;}
  }

  async function signedMap(paths){
    const unique=[...new Set(paths.filter(Boolean))];
    if(!unique.length)return {};
    const missing=unique.filter(path=>{const hit=cache.get(path);return !(hit&&hit.exp>Date.now());});
    if(missing.length){
      try{
        const rows=await result(db.storage.from('community-media').createSignedUrls(missing,SIGNED_SECONDS));
        for(const row of rows||[]){
          const url=row?.signedUrl||row?.signedURL;
          if(url&&row.path&&!row.error)cache.set(row.path,{url,exp:Date.now()+CACHE_MS});
        }
      }catch{/* Fall back to single signatures below. */}
      await Promise.all(unique.filter(path=>!(cache.get(path)?.exp>Date.now())).map(signed));
    }
    return Object.fromEntries(unique.map(path=>[path,cache.get(path)?.url||null]));
  }

  async function loadStats(ids){
    const map=new Map();
    if(!ids.length)return map;
    try{
      const rows=await result(db.rpc('post_stats_batch',{targets:ids}));
      let usable=false;
      for(const row of Array.isArray(rows)?rows:[]){
        const stats=unwrapStats(row?.stats&&typeof row.stats==='object'?row.stats:row);
        const id=row?.post_id||row?.target;
        if(id&&stats){map.set(id,stats);usable=true;}
      }
      if(usable)return map;
    }catch{/* Batch RPC is optional until the migration is applied. */}
    await Promise.all(ids.map(async id=>{
      try{map.set(id,await result(db.rpc('post_stats',{target:id}))||{});}
      catch{map.set(id,{});}
    }));
    return map;
  }

  async function hydrate(posts){
    const list=(posts||[]).filter(post=>post?.id);
    const ids=list.map(post=>post.id);
    const map=new Map();
    if(!ids.length)return map;
    const user=getUser();
    const [stats,likes,saves,media]=await Promise.all([
      loadStats(ids),
      user?result(db.from('likes').select('post_id').eq('user_id',user.id).in('post_id',ids)).catch(()=>[]):[],
      user?result(db.from('saved_posts').select('post_id').eq('user_id',user.id).in('post_id',ids)).catch(()=>[]):[],
      result(db.from('post_media').select('*').in('post_id',ids).order('position')).catch(()=>[])
    ]);
    const mediaByPost=new Map();
    for(const row of media||[]){
      if(!mediaByPost.has(row.post_id))mediaByPost.set(row.post_id,[]);
      mediaByPost.get(row.post_id).push(row);
    }
    const paths=[];
    for(const post of list){
      if(post.media_path)paths.push(post.media_path);
      const posters=post.media_posters&&typeof post.media_posters==='object'?post.media_posters:{};
      for(const poster of Object.values(posters))if(poster)paths.push(poster);
    }
    for(const row of media||[])if(row.path)paths.push(row.path);
    const urls=await signedMap(paths);
    const liked=new Set((likes||[]).map(row=>row.post_id));
    const saved=new Set((saves||[]).map(row=>row.post_id));
    for(const post of list){
      map.set(post.id,{
        stats:stats.get(post.id)||{},
        liked:liked.has(post.id),
        saved:saved.has(post.id),
        attachments:mediaByPost.get(post.id)||[],
        urls
      });
    }
    return map;
  }

  function posterFor(post,item,urls){
    const map=post?.media_posters&&typeof post.media_posters==='object'?post.media_posters:{};
    const path=map[item?.path];
    return path&&urls?.[path]?urls[path]:'';
  }
  function soundButton(){
    return '<button type="button" class="ig-mute" aria-label="Turn on sound" aria-pressed="false"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="m16 10 4 4m0-4-4 4"/></svg></button>';
  }
  function slide(post,item,url,index,urls){
    if(!url)return '';
    const path=esc(item.path||'');
    if(item.media_type==='video'){
      const poster=posterFor(post,item,urls);
      return `<div class="carousel-slide"><div class="media-frame"><video class="media ig-video" src="${esc(url)}" ${poster?`poster="${esc(poster)}"`:''} data-path="${path}" muted playsinline loop preload="metadata" data-inline data-video="${post.id}"></video>${soundButton()}</div></div>`;
    }
    const alt=index? 'Additional post image' : `Image shared by ${post.profiles?.display_name||'a fan'}`;
    return `<div class="carousel-slide"><div class="media-frame"><img class="media" src="${esc(url)}" data-path="${path}" alt="${esc(alt)}" loading="lazy"></div></div>`;
  }

  function renderMedia(post,ctx){
    if(!post?.media_path||post.kind==='story')return '';
    const items=[{path:post.media_path,media_type:post.media_type},...(ctx?.attachments||[])];
    const slides=items.map((item,index)=>slide(post,item,ctx?.urls?.[item.path],index,ctx?.urls)).filter(Boolean);
    if(!slides.length)return '';
    if(slides.length===1)return `<div class="media-stage" data-post-media="${post.id}">${slides[0]}</div>`;
    const dots=slides.map((_,index)=>`<button type="button" class="carousel-dot${index===0?' on':''}" data-go="${index}" aria-label="Show attachment ${index+1} of ${slides.length}"></button>`).join('');
    return `<div class="media-carousel" data-carousel data-post-media="${post.id}" tabindex="0" aria-roledescription="carousel" aria-label="Post attachments"><div class="carousel-track">${slides.join('')}</div><button type="button" class="carousel-arrow prev" data-car-prev aria-label="Previous attachment" hidden>‹</button><button type="button" class="carousel-arrow next" data-car-next aria-label="Next attachment">›</button><span class="carousel-count" aria-live="polite">1/${slides.length}</span><div class="carousel-dots">${dots}</div></div>`;
  }

  function bindCarousels(root){
    root.querySelectorAll('[data-carousel]').forEach(carousel=>{
      if(carousel.dataset.bound==='1')return;
      carousel.dataset.bound='1';
      const track=carousel.querySelector('.carousel-track');
      const slides=[...track.children];
      const count=carousel.querySelector('.carousel-count');
      const dots=[...carousel.querySelectorAll('.carousel-dot')];
      const prev=carousel.querySelector('[data-car-prev]');
      const next=carousel.querySelector('[data-car-next]');
      const index=()=>Math.max(0,Math.min(slides.length-1,Math.round(track.scrollLeft/Math.max(track.clientWidth,1))));
      const sync=()=>{
        const current=index();
        if(count)count.textContent=`${current+1}/${slides.length}`;
        dots.forEach((dot,i)=>dot.classList.toggle('on',i===current));
        dots.forEach((dot,i)=>dot.setAttribute('aria-current',i===current?'true':'false'));
        if(prev)prev.hidden=current<=0;
        if(next)next.hidden=current>=slides.length-1;
      };
      const go=i=>{
        const nextIndex=Math.max(0,Math.min(slides.length-1,i));
        track.scrollTo({left:nextIndex*track.clientWidth,behavior:'smooth'});
      };
      track.addEventListener('scroll',()=>{clearTimeout(carousel._scroll);carousel._scroll=setTimeout(sync,50);},{passive:true});
      prev.onclick=event=>{event.stopPropagation();go(index()-1);};
      next.onclick=event=>{event.stopPropagation();go(index()+1);};
      dots.forEach(dot=>dot.onclick=event=>{event.stopPropagation();go(Number(dot.dataset.go));});
      carousel.addEventListener('keydown',event=>{
        if(event.key==='ArrowRight'){event.preventDefault();go(index()+1);}
        if(event.key==='ArrowLeft'){event.preventDefault();go(index()-1);}
      });
      sync();
    });
  }

  function ensureLightbox(){
    let box=document.querySelector('#lightbox');
    if(box)return box;
    box=document.createElement('div');
    box.id='lightbox';
    box.hidden=true;
    box.innerHTML='<button type="button" id="lightbox-close" aria-label="Close image">×</button><img id="lightbox-img" alt="">';
    document.body.append(box);
    const close=()=>{box.hidden=true;document.body.classList.remove('lightbox-open');};
    box.querySelector('#lightbox-close').onclick=close;
    box.onclick=event=>{if(event.target===box)close();};
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!box.hidden)close();});
    return box;
  }

  function openLightbox(src,alt){
    const box=ensureLightbox();
    const image=box.querySelector('img');
    image.src=src;
    image.alt=alt||'Expanded post image';
    box.hidden=false;
    document.body.classList.add('lightbox-open');
    box.querySelector('#lightbox-close').focus();
  }

  function popHeart(stage,x,y){
    const rect=stage.getBoundingClientRect();
    const heart=document.createElement('span');
    heart.className='heart-pop';
    heart.textContent='♥';
    heart.style.left=`${x-rect.left}px`;
    heart.style.top=`${y-rect.top}px`;
    stage.append(heart);
    heart.addEventListener('animationend',()=>heart.remove());
  }

  const soundOn='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7.5a6.5 6.5 0 0 1 0 9"/></svg>';
  const soundOff='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="m16 10 4 4m0-4-4 4"/></svg>';
  function syncSound(video){
    const button=video.closest('.media-frame, .explore-tile')?.querySelector('.ig-mute');
    if(!button)return;
    button.innerHTML=video.muted?soundOff:soundOn;
    button.setAttribute('aria-label',video.muted?'Turn on sound':'Turn off sound');
    button.setAttribute('aria-pressed',String(!video.muted));
  }
  function bindInlineVideos(scope,{onDoubleLike}={}){
    const host=scope&&scope.querySelectorAll?scope:document;
    const videos=[...host.querySelectorAll('video[data-inline]')];
    if(!videos.length)return;
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saver=navigator.connection?.saveData;
    const autoplay=!(reduce||saver);
    const silence=(current)=>{videos.forEach(video=>{if(video!==current&&!video.muted){video.muted=true;syncSound(video);}});};
    const toggle=(video)=>{
      if(video.muted){silence(video);video.muted=false;}
      else video.muted=true;
      const preview=video.dataset.preview;
      if(preview&&!video.getAttribute('src'))video.src=preview;
      if(video.paused)video.play().catch(()=>{});
      syncSound(video);
    };
    videos.forEach(video=>{
      if(video.dataset.inlineBound==='1')return;
      video.dataset.inlineBound='1';
      syncSound(video);
      let tap=0;
      video.addEventListener('click',event=>{
        if(video.closest('.explore-tile'))return;
        event.stopPropagation();
        if(event.detail>=2){clearTimeout(tap);onDoubleLike?.(video.dataset.video);return;}
        tap=setTimeout(()=>toggle(video),260);
      });
      const button=video.closest('.media-frame, .explore-tile')?.querySelector('.ig-mute');
      if(button&&button.dataset.bound!=='1'){
        button.dataset.bound='1';
        button.addEventListener('click',event=>{event.stopPropagation();event.preventDefault();toggle(video);});
      }
    });
    if(!autoplay||!('IntersectionObserver' in window))return;
    const io=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        const video=entry.target;
        if(!(video instanceof HTMLVideoElement))return;
        if(entry.isIntersecting&&entry.intersectionRatio>=0.5){
          const preview=video.dataset.preview;
          if(preview&&!video.getAttribute('src'))video.src=preview;
          video.play().catch(()=>{});
        }else video.pause();
      });
    },{threshold:[0,0.5,1]});
    videos.forEach(video=>io.observe(video));
  }

  function bindStages(root,{onDoubleLike}={}){
    const scope=root&&root.querySelectorAll?root:document;
    bindCarousels(scope);
    bindInlineVideos(scope,{onDoubleLike});
    const host=scope instanceof Document?document.documentElement:scope;
    if(!host.dataset.mediaErrors){
      host.dataset.mediaErrors='1';
      scope.addEventListener('error',event=>{
        const img=event.target;
        if(!(img instanceof HTMLImageElement)||!img.dataset.path||img.dataset.resigned)return;
        img.dataset.resigned='1';
        cache.delete(img.dataset.path);
        signed(img.dataset.path).then(url=>{if(url&&img.isConnected)img.src=url;}).catch(()=>{});
      },true);
    }
    scope.querySelectorAll('[data-post-media]').forEach(stage=>{
      if(stage.dataset.tapBound==='1')return;
      stage.dataset.tapBound='1';
      const id=stage.dataset.postMedia;
      let timer=0;
      stage.addEventListener('click',event=>{
        if(event.target.closest('button,video,a'))return;
        const image=event.target.closest('img.media');
        if(event.detail>=2){
          clearTimeout(timer);
          popHeart(stage,event.clientX,event.clientY);
          onDoubleLike?.(id);
          return;
        }
        if(!image)return;
        const src=image.currentSrc||image.src;
        const alt=image.alt;
        timer=setTimeout(()=>openLightbox(src,alt),260);
      });
    });
  }

  const liveButtons=new Set();
  if(typeof window!=='undefined'&&!watchMore.bound){
    watchMore.bound=true;
    window.addEventListener('scroll',()=>{for(const button of liveButtons){if(!button.isConnected)liveButtons.delete(button);else button._bursts=0;}},{passive:true});
  }
  function watchMore(button,loadMore){
    if(!button)return;
    if(button._io)button._io.disconnect();
    let sentinel=button.previousElementSibling;
    if(!sentinel?.classList.contains('scroll-sentinel')){
      sentinel=document.createElement('div');
      sentinel.className='scroll-sentinel';
      sentinel.setAttribute('aria-hidden','true');
      button.before(sentinel);
    }
    button._bursts=0;
    liveButtons.add(button);
    const pump=()=>{
      if(!button.isConnected||button.hidden||button.disabled||button._bursts>=3)return;
      const rect=sentinel.getBoundingClientRect();
      if(rect.top<window.innerHeight+700){
        button._bursts+=1;
        button.disabled=true;
        loadMore();
      }
    };
    if('IntersectionObserver' in window){
      const io=new IntersectionObserver(()=>pump(),{rootMargin:'700px 0px'});
      io.observe(sentinel);
      button._io=io;
    }
    button.onclick=()=>{if(button.disabled)return;button._bursts=0;button.disabled=true;loadMore();};
    button._pump=()=>{button._bursts=Math.min(button._bursts||0,2);pump();};
  }

  return {signed,hydrate,renderMedia,bindStages,bindInlineVideos,watchMore};
}
