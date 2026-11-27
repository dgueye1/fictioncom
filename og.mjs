const DEFAULT_TITLE='FictionCom — Your fandom, together';
const DEFAULT_DESCRIPTION='Share your anime world. Photos, theories, and episode conversations on FictionCom.';

export function isAppRoute(pathname){
  const path=pathname.replace(/\/+$/,'')||'/';
  return path==='/'||path==='/feed'||path==='/explore'||path==='/chat'||/^\/p\/[0-9a-f-]{36}$/i.test(path)||/^\/u\/[a-z0-9_]{3,24}$/i.test(path)||/^\/series\/[^/]+$/.test(path);
}

function escapeAttr(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function clip(value,max){
  return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
}

async function supabaseGet(fetchImpl,base,key,table,query){
  const response=await fetchImpl(`${base}/rest/v1/${table}?${query}&limit=1`,{
    headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},
    signal:AbortSignal.timeout(2500)
  });
  if(!response.ok)return null;
  const rows=await response.json();
  return Array.isArray(rows)?rows[0]:null;
}

function profileName(row){
  const profile=Array.isArray(row?.profiles)?row.profiles[0]:row?.profiles;
  return profile?.display_name||profile?.username||'a fan';
}

export async function applyOpenGraph(html,url,{fetchImpl=fetch,supabaseUrl,supabaseKey}={}){
  const meta={
    title:DEFAULT_TITLE,
    description:DEFAULT_DESCRIPTION,
    image:url.origin+'/og-image.png',
    url:url.origin+url.pathname+(url.search||'')
  };
  try{
    const post=url.pathname.match(/^\/p\/([0-9a-f-]{36})$/i);
    const person=url.pathname.match(/^\/u\/([a-z0-9_]{3,24})$/i);
    const series=url.pathname.match(/^\/series\/([^/]+)$/);
    if(post&&supabaseUrl&&supabaseKey){
      const row=await supabaseGet(fetchImpl,supabaseUrl,supabaseKey,'posts',`id=eq.${post[1]}&status=eq.approved&select=title,body,series,kind,profiles!posts_author_fkey(username,display_name)`);
      if(row){
        meta.title=clip(row.title||(row.series?`${row.series} on FictionCom`:'Post on FictionCom'),90);
        meta.description=clip(row.body,180)||clip(row.title,180)||`${profileName(row)} shared a ${row.kind||'post'} on FictionCom.`;
      }
    }else if(person&&supabaseUrl&&supabaseKey){
      const row=await supabaseGet(fetchImpl,supabaseUrl,supabaseKey,'profiles',`username=eq.${person[1].toLowerCase()}&select=display_name,username,bio`);
      if(row){
        meta.title=clip(`${row.display_name} (@${row.username}) · FictionCom`,90);
        meta.description=clip(row.bio,180)||`See @${row.username} on FictionCom.`;
      }
    }else if(series){
      const title=decodeURIComponent(series[1]);
      const medium=url.searchParams.get('medium')==='manga'?'Manga':'Anime';
      meta.title=clip(`${title} · ${medium} · FictionCom`,90);
      meta.description=`Theories and conversations about ${title} on FictionCom.`;
    }else if(url.pathname==='/explore'){
      meta.title='Explore · FictionCom';
      meta.description='Discover anime and manga posts, trending series, and creators on FictionCom.';
    }else if(url.pathname==='/chat'){
      meta.title='Chat · FictionCom';
      meta.description='Message other fans on FictionCom.';
    }
  }catch{/* Keep the site-wide tags when a lookup fails. */}
  return injectMeta(html,meta);
}

function setMeta(html,attribute,key,content){
  const tag=`<meta ${attribute}="${key}" content="${escapeAttr(content)}">`;
  const pattern=new RegExp(`<meta ${attribute}="${key}" content="[^"]*">`);
  if(pattern.test(html))return html.replace(pattern,tag);
  return html.replace('</head>',tag+'</head>');
}

function injectMeta(html,meta){
  let next=html.replace(/<title>.*?<\/title>/,`<title>${escapeAttr(meta.title)}</title>`);
  next=setMeta(next,'property','og:title',meta.title);
  next=setMeta(next,'property','og:description',meta.description);
  next=setMeta(next,'property','og:url',meta.url);
  next=setMeta(next,'property','og:image',meta.image);
  next=setMeta(next,'name','twitter:title',meta.title);
  next=setMeta(next,'name','twitter:description',meta.description);
  next=setMeta(next,'name','twitter:url',meta.url);
  next=setMeta(next,'name','twitter:image',meta.image);
  next=setMeta(next,'name','description',meta.description);
  if(/<link rel="canonical" href="[^"]*">/.test(next))next=next.replace(/<link rel="canonical" href="[^"]*">/,`<link rel="canonical" href="${escapeAttr(meta.url)}">`);
  return next;
}
