const KEY='fictioncom-interests';
const empty=()=>({series:{},types:{},tags:{},authors:{},synced:{series:{},types:{},tags:{},authors:{}}});

function load(){
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||'');
    if(saved&&typeof saved==='object')return {...empty(),...saved,synced:saved.synced||empty().synced};
  }catch{}
  return empty();
}

export function postTypeKey(post){
  if(!post)return 'post';
  if(post.kind==='theory')return 'theory';
  if(post.kind==='reaction'&&post.medium==='manga')return 'chapters';
  if(post.kind==='reaction')return 'episodes';
  return 'post';
}

export function postTypeLabel(post){
  const key=postTypeKey(post);
  if(key==='theory')return 'Theory';
  if(key==='chapters')return 'Chapter review Ch. '+(post?.episode||'?');
  if(key==='episodes')return 'Episode review Ep. '+(post?.episode||'?');
  return '';
}

export function postTypeBadge(post){
  const key=postTypeKey(post);
  const label=postTypeLabel(post);
  if(!label)return '';
  const cls=key==='chapters'?'chapter':key==='episodes'?'episode':'theory';
  return `<span class="type-badge ${cls}">${label.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span>`;
}

export function hashtags(text){
  return [...String(text||'').matchAll(/#([A-Za-z][A-Za-z0-9_]{1,39})/g)].map(match=>match[1].toLowerCase());
}

export function createInterests({db,getUser}){
  let data=load();
  let timer=0;
  const visible=new Map();
  const playing=new Map();
  const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(data));}catch{}};
  function bump(bag,key,ms){if(!key||ms<=0)return;bag[key]=(bag[key]||0)+ms;}
  function note({series,type,author,tags,ms}){
    if(!ms||ms<250)return;
    bump(data.series,series,ms);
    bump(data.types,type,ms);
    bump(data.authors,author,ms);
    (tags||[]).forEach(tag=>bump(data.tags,tag,ms));
    persist();
    scheduleSync();
  }
  function hasSignals(follows){
    const dwell=Object.values(data.series).reduce((sum,n)=>sum+n,0)+Object.values(data.types).reduce((sum,n)=>sum+n,0)+Object.values(data.tags).reduce((sum,n)=>sum+n,0);
    return dwell>3000||(follows?.authors?.size||0)>0||(follows?.series?.size||0)>0||(follows?.tags?.size||0)>0;
  }
  function score(post,follows){
    const type=postTypeKey(post);
    const tags=hashtags(post.body);
    let value=0;
    if(follows?.authors?.has(post.author))value+=8000;
    if(post.series&&follows?.series?.has(post.series))value+=6000;
    if(tags.some(tag=>follows?.tags?.has(tag)))value+=3000;
    value+=(data.series[post.series]||0)/800;
    value+=(data.types[type]||0)/800;
    value+=(data.authors[post.author]||0)/1200;
    tags.forEach(tag=>{value+=(data.tags[tag]||0)/1000;});
    const ageHours=Math.max(0,(Date.now()-new Date(post.created_at||0).getTime())/3600000);
    value+=Math.max(0,240-ageHours);
    return value;
  }
  async function sync(){
    const user=getUser?.();
    if(!user||!db)return;
    const signals=[];
    for(const kind of ['series','types','tags','authors']){
      for(const [key,total] of Object.entries(data[kind]||{})){
        const sent=data.synced?.[kind]?.[key]||0;
        const delta=Math.round(total-sent);
        if(delta>=1000&&key)signals.push({kind:kind==='types'?'type':kind==='authors'?'author':kind==='tags'?'tag':'series',key:String(key).slice(0,120),dwell_ms:delta});
      }
    }
    if(!signals.length)return;
    try{
      const response=await db.rpc('record_interest',{signals});
      if(response?.error)return;
      data.synced=data.synced||empty().synced;
      for(const kind of ['series','types','tags','authors'])data.synced[kind]={...(data[kind]||{})};
      persist();
    }catch{/* The migration is optional. localStorage remains the source of truth. */}
  }
  function scheduleSync(){clearTimeout(timer);timer=setTimeout(()=>sync().catch(()=>{}),4000);}
  function meta(node){
    return {id:node.dataset.dwell,series:node.dataset.series||'',type:node.dataset.type||'post',author:node.dataset.author||'',tags:(node.dataset.tags||'').split(' ').filter(Boolean)};
  }
  function commit(id,ms){
    const node=document.querySelector(`[data-dwell="${CSS.escape(id)}"]`);
    if(!node)return;
    note({...meta(node),ms});
  }
  let observer;
  function watch(root){
    if(!root?.querySelectorAll)return;
    if(!observer){
      observer=new IntersectionObserver(entries=>{
        const now=performance.now();
        entries.forEach(entry=>{
          const id=entry.target.dataset.dwell;
          if(!id)return;
          if(entry.intersectionRatio>=0.5){if(!visible.has(id))visible.set(id,now);}
          else if(visible.has(id)){commit(id,now-visible.get(id));visible.delete(id);}
        });
      },{threshold:[0,0.5,0.75,1]});
      document.addEventListener('visibilitychange',()=>{
        if(document.hidden){const now=performance.now();for(const [id,start] of visible)commit(id,now-start);visible.clear();}
      });
      setInterval(()=>{
        const now=performance.now();
        for(const [id,start] of visible){if(now-start>4000){commit(id,now-start);visible.set(id,now);}}
      },4000);
    }
    root.querySelectorAll('[data-dwell]').forEach(node=>{
      if(node.dataset.dwellBound==='1')return;
      node.dataset.dwellBound='1';
      observer.observe(node);
      node.querySelectorAll('video').forEach(video=>{
        let last=0;
        video.addEventListener('timeupdate',()=>{
          const id=node.dataset.dwell;
          if(!id||!visible.has(id)){last=video.currentTime;return;}
          const delta=Math.max(0,video.currentTime-last);
          last=video.currentTime;
          if(delta>0&&delta<2)note({...meta(node),ms:delta*1000});
        });
        video.addEventListener('seeked',()=>{last=video.currentTime;});
        video.addEventListener('play',()=>{playing.set(video,performance.now());});
      });
    });
  }
  return {note,watch,score,hasSignals,sync};
}
