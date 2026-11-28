import {searchCatalog, attachCatalog} from './catalog.js';

const REACTIONS=['😂','❤️','🔥','😭','🤯','👏'];
const SEED=[
  ['character','Luffy'],['character','Zoro'],['character','Nami'],['character','Sanji'],
  ['character','Naruto'],['character','Goku'],['character','Vegeta'],['character','Gojo'],
  ['character','Eren'],['character','Mikasa'],['character','Tanjiro'],['character','Levi'],
  ['character','Light'],['character','L'],['arc','Egghead'],['arc','Wano'],['arc','Marineford'],
  ['arc','Enies Lobby'],['arc','Dressrosa'],['arc','Shibuya'],['arc','Chimera Ant'],['arc','Namek']
];
const SHELVES=[
  ['reading','Reading'],
  ['watching','Watching'],
  ['completed','Completed'],
  ['dropped','Dropped']
];

function missing(error){
  if(!error)return false;
  const code=String(error.code||'');
  const msg=String(error.message||'').toLowerCase();
  return code==='42P01'||code==='PGRST205'||code==='PGRST202'||code==='42883'||msg.includes('schema cache')||msg.includes('could not find')||msg.includes('does not exist');
}
function weekStart(){
  const now=new Date();
  const day=now.getUTCDay()||7;
  const monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-(day-1)));
  return monday.toISOString().slice(0,10);
}
function unitWord(medium,n){return medium==='manga'?(n===1?'chapter':'chapters'):(n===1?'episode':'episodes');}
function unitShort(medium){return medium==='manga'?'Ch.':'Ep.';}

export function createFandom({db,$,esc,result,toast,fail,guarded,requireProfile,getUser,getMe,modal,close,openPost,showProfile,signed}){
  const pack=new Map();
  let capsPromise=null;
  const uid=()=>getUser()?.id;

  function caps(){
    if(!capsPromise)capsPromise=probe();
    return capsPromise;
  }
  async function probe(){
    const names=['drop_threads','drop_notices','theory_votes','theory_calls','reading_shelves','favorite_characters','fandom_tags','post_extras','polls','post_reactions'];
    const rows=await Promise.all(names.map(async name=>{
      const response=await db.from(name).select('id').limit(1);
      return [name,!missing(response.error)];
    }));
    const flags=Object.fromEntries(rows);
    flags.drops=flags.drop_threads;
    flags.votes=flags.theory_votes;
    flags.calls=flags.theory_calls;
    flags.shelves=flags.reading_shelves;
    flags.characters=flags.favorite_characters;
    flags.tags=flags.fandom_tags;
    flags.extras=flags.post_extras;
    flags.reactions=flags.post_reactions;
    return flags;
  }
  async function optional(run){
    try{
      const response=await run();
      if(response?.error){if(missing(response.error))return null;throw response.error;}
      return response.data;
    }catch(error){
      if(missing(error))return null;
      return null;
    }
  }

  function remember(id,extra){
    pack.set(id,{...(pack.get(id)||{}),...extra});
  }
  function cardBits(post){
    const extra=pack.get(post?.id)||{};
    const badges=[];
    if(extra.postType==='fanart')badges.push('<span class="type-badge fanart">Fan art</span>');
    if(extra.postType==='cosplay')badges.push('<span class="type-badge cosplay">Cosplay</span>');
    if(extra.postType==='poll')badges.push('<span class="type-badge poll">Poll</span>');
    if(extra.called)badges.push('<span class="called-it">Called it</span>');
    if(extra.reviewScore)badges.push('<span class="review-score">'+extra.reviewScore+'/10</span>');
    const credit=extra.artistCredit?'<p class="artist-credit">Art by '+esc(extra.artistCredit)+'</p>':'';
    const tags=(extra.tags||[]).map(tag=>'<button type="button" class="fandom-tag" data-fandom-tag="'+esc(tag.kind)+'" data-fandom-name="'+esc(tag.name)+'">'+esc(tag.name)+'</button>').join('');
    const votes=post?.kind==='theory'?voteHtml(post.id, extra.score||0, extra.mine||0):'';
    return {badges:badges.join(''),credit,tags:tags?'<div class="fandom-tags">'+tags+'</div>':'',votes,poll:pollHtml(post, extra.poll)};
  }
  function voteHtml(id,score,mine){
    return '<div class="theory-votes" data-theory-vote="'+id+'"><button type="button" data-vote-dir="1" aria-pressed="'+(mine===1)+'" aria-label="Upvote theory">▲</button><strong data-vote-score>'+score+'</strong><button type="button" data-vote-dir="-1" aria-pressed="'+(mine===-1)+'" aria-label="Downvote theory">▼</button></div>';
  }
  function pollHtml(post,poll){
    if(!poll)return '';
    const options=Array.isArray(poll.options)?poll.options:[];
    const counts=new Map((poll.counts||[]).map(row=>[Number(row.index??row.option_index), Number(row.votes||0)]));
    const total=options.reduce((sum,_,index)=>sum+(counts.get(index)||0),0)||0;
    const bars=options.map((label,index)=>{
      const votes=counts.get(index)||0;
      const pct=total?Math.round(votes/total*100):0;
      const picked=Number(poll.mine)===index;
      return '<button type="button" class="poll-option'+(picked?' picked':'')+'" data-poll-post="'+post.id+'" data-poll-index="'+index+'"><span>'+esc(label)+'</span><span class="poll-bar"><span style="width:'+pct+'%"></span></span><em>'+votes+'</em></button>';
    }).join('');
    return '<div class="poll-card" data-poll="'+post.id+'"><strong>'+esc(poll.question||'Best chapter this week')+'</strong>'+bars+'<p class="small">'+total+' '+(total===1?'vote':'votes')+'</p></div>';
  }

  async function annotate(posts,hydrated){
    const ready=await caps();
    const ids=(posts||[]).map(post=>post.id).filter(Boolean);
    if(!ids.length)return ready;
    const theoryIds=posts.filter(post=>post.kind==='theory').map(post=>post.id);
    const [extras,scores,calls,reactions,tags,polls]=await Promise.all([
      ready.extras?optional(()=>db.from('post_extras').select('*').in('post_id',ids)):null,
      ready.votes&&theoryIds.length?optional(()=>db.rpc('theory_scores',{targets:theoryIds})):null,
      ready.calls&&theoryIds.length?optional(()=>db.from('theory_calls').select('post_id,called_by').in('post_id',theoryIds)):null,
      ready.reactions?optional(()=>db.from('post_reactions').select('post_id,user_id,emoji').in('post_id',ids)):null,
      ready.tags?optional(()=>db.from('post_fandom_tags').select('post_id,fandom_tags(name,kind)').in('post_id',ids)):null,
      ready.polls?optional(()=>db.from('polls').select('id,post_id,question,options,week_start').in('post_id',ids)):null
    ]);
    const pollIds=(polls||[]).map(row=>row.id);
    const pollVotes=ready.polls&&pollIds.length?await optional(()=>db.from('poll_votes').select('poll_id,user_id,option_index').in('poll_id',pollIds)):null;
    for(const post of posts){
      const extra=(extras||[]).find(row=>row.post_id===post.id)||{};
      const score=(scores||[]).find(row=>row.post_id===post.id);
      const poll=(polls||[]).find(row=>row.post_id===post.id);
      const votes=(pollVotes||[]).filter(row=>row.poll_id===poll?.id);
      remember(post.id,{
        postType:extra.post_type||'post',
        artistCredit:extra.artist_credit||'',
        layout:extra.layout||null,
        reviewScore:extra.review_score||null,
        called:!!(calls||[]).find(row=>row.post_id===post.id),
        score:score?.score||0,
        mine:score?.mine||0,
        reactions:(reactions||[]).filter(row=>row.post_id===post.id),
        tags:(tags||[]).filter(row=>row.post_id===post.id).map(row=>({name:row.fandom_tags?.name,kind:row.fandom_tags?.kind})).filter(tag=>tag.name),
        poll:poll?{...poll,counts:tally(votes),mine:votes.find(row=>row.user_id===uid())?.option_index}:null
      });
      const stored=hydrated?.get?.(post.id);
      if(stored&&extra.layout)stored.layout=extra.layout;
    }
    return ready;
  }
  function tally(votes){
    const map=new Map();
    for(const vote of votes||[])map.set(vote.option_index,(map.get(vote.option_index)||0)+1);
    return [...map.entries()].map(([index,votes])=>({index,votes}));
  }

  function decorate(root){
    const scope=root||document;
    scope.querySelectorAll('article[data-post]').forEach(article=>{
      const id=article.dataset.post;
      if(article.querySelector('.speech-bubble'))return;
      const extra=pack.get(id)||{};
      const counts=new Map();
      for(const row of extra.reactions||[])counts.set(row.emoji,(counts.get(row.emoji)||0)+1);
      const mine=new Set((extra.reactions||[]).filter(row=>row.user_id===uid()).map(row=>row.emoji));
      const chips=REACTIONS.map(emoji=>'<button type="button" data-react="'+emoji+'" aria-pressed="'+mine.has(emoji)+'">'+emoji+' <span>'+(counts.get(emoji)||'')+'</span></button>').join('');
      const bubble=document.createElement('div');
      bubble.className='speech-bubble';
      bubble.innerHTML='<button type="button" class="speech-toggle" aria-label="React" aria-expanded="false">💬</button><div class="speech-pop" hidden>'+chips+'</div>';
      (article.querySelector('.ig-actions-left')||article.querySelector('.ig-actions'))?.append(bubble);
      const toggle=bubble.querySelector('.speech-toggle');
      const pop=bubble.querySelector('.speech-pop');
      toggle.onclick=event=>{event.stopPropagation();const open=pop.hidden;scope.querySelectorAll('.speech-pop').forEach(node=>{node.hidden=true;});pop.hidden=!open;toggle.setAttribute('aria-expanded',String(open));};
      bubble.querySelectorAll('[data-react]').forEach(button=>button.onclick=async event=>{
        event.stopPropagation();
        if(!requireProfile())return;
        const ready=await caps();
        if(!ready.reactions){toast('Speech reactions turn on after the fandom update.');return;}
        button.disabled=true;
        try{
          const rows=await result(db.rpc('toggle_post_reaction',{target:id,picked:button.dataset.react}));
          remember(id,{reactions:(rows||[]).flatMap(row=>Array.from({length:row.tally},(_,index)=>({emoji:row.emoji,user_id:row.mine&&index===0?uid():'other'})))});
          article.querySelector('.speech-bubble')?.remove();
          decorate(article.parentElement||article);
        }catch(error){fail(error);}finally{button.disabled=false;}
      });
    });
    scope.querySelectorAll('[data-vote-dir]').forEach(button=>{
      if(button.dataset.bound==='1')return;
      button.dataset.bound='1';
      button.onclick=async()=>{
        if(!requireProfile())return;
        const ready=await caps();
        const wrap=button.closest('[data-theory-vote]');
        if(!ready.votes){toast('Theory votes turn on after the fandom update.');return;}
        const id=wrap.dataset.theoryVote;
        const current=pack.get(id)?.mine||0;
        const picked=Number(button.dataset.voteDir);
        const direction=current===picked?0:picked;
        button.disabled=true;
        try{
          const row=await result(db.rpc('vote_theory',{target:id,direction}));
          const next=Array.isArray(row)?row[0]:row;
          remember(id,{score:next?.score||0,mine:next?.mine||0});
          wrap.querySelector('[data-vote-score]').textContent=String(next?.score||0);
          wrap.querySelectorAll('[data-vote-dir]').forEach(node=>node.setAttribute('aria-pressed',String(Number(node.dataset.voteDir)===Number(next?.mine||0))));
        }catch(error){fail(error);}finally{button.disabled=false;}
      };
    });
    scope.querySelectorAll('[data-fandom-tag]').forEach(button=>{
      if(button.dataset.bound==='1')return;
      button.dataset.bound='1';
      button.onclick=()=>openTag(button.dataset.fandomTag,button.dataset.fandomName);
    });
    scope.querySelectorAll('[data-poll-index]').forEach(button=>{
      if(button.dataset.bound==='1')return;
      button.dataset.bound='1';
      button.onclick=async()=>{
        if(!requireProfile())return;
        const ready=await caps();
        if(!ready.polls){toast('Polls turn on after the fandom update.');return;}
        button.disabled=true;
        try{
          const payload=await result(db.rpc('cast_poll_vote',{target:button.dataset.pollPost,option_index:Number(button.dataset.pollIndex)}));
          remember(button.dataset.pollPost,{poll:{question:payload.question,options:payload.options,counts:payload.counts,mine:payload.mine}});
          const card=button.closest('.poll-card');
          if(card)card.outerHTML=pollHtml({id:button.dataset.pollPost},pack.get(button.dataset.pollPost).poll);
          decorate(scope);
        }catch(error){fail(error);}finally{button.disabled=false;}
      };
    });
    scope.querySelectorAll('[data-call-theory]').forEach(button=>{
      if(button.dataset.bound==='1')return;
      button.dataset.bound='1';
      button.onclick=async()=>{
        if(!requireProfile())return;
        const ready=await caps();
        if(!ready.calls){toast('Called it turns on after the fandom update.');return;}
        const id=button.dataset.callTheory;
        const confirmed=!pack.get(id)?.called;
        try{
          await result(db.rpc('call_theory',{target:id,confirmed}));
          remember(id,{called:confirmed});
          toast(confirmed?'Marked as called it.':'Removed the called-it mark.');
          button.textContent=confirmed?'Undo called it':'Called it';
          const article=button.closest('article');
          if(article&&confirmed&&!article.querySelector('.called-it'))article.querySelector('.ig-id')?.insertAdjacentHTML('beforeend','<span class="called-it">Called it</span>');
          if(article&&!confirmed)article.querySelector('.called-it')?.remove();
        }catch(error){fail(error);}
      };
    });
  }

  function openTag(kind,name){
    const slug=encodeURIComponent(String(name||'').trim());
    const path='/tag/'+(kind==='arc'?'arc':'character')+'/'+slug;
    if(location.pathname!==path)history.pushState({view:'tag'},'',path);
    document.dispatchEvent(new CustomEvent('fictioncom-route'));
  }
  function openDrop(title,medium,number){
    const unit=medium==='manga'?'chapter':'episode';
    const path='/series/'+encodeURIComponent(title)+'/'+unit+'/'+number;
    if(location.pathname!==path)history.pushState({view:'drop'},'',path);
    document.dispatchEvent(new CustomEvent('fictioncom-route'));
  }

  async function pageSeries(item,current){
    const title=item?.title||item?.series||'Series';
    const medium=item?.medium==='manga'?'manga':'anime';
    const host=$('#content');
    if(!host)return;
    $('#view-title').textContent=title;
    host.innerHTML='<section class="series-hub" aria-busy="true"><div class="series-hero"><div class="series-cover skeleton-block"></div><div class="series-hero-copy"><div class="skeleton-line"></div><div class="skeleton-line short"></div><div class="skeleton-line"></div></div></div><div class="series-columns"><div class="skeleton-block tall"></div><div class="skeleton-block tall"></div></div></section>';
    const ready=await caps();
    const postQuery=db.from('posts').select('id,title,body,kind,episode,spoiler,author,created_at,medium,series,media_path,media_type,profiles!posts_author_fkey(username,display_name)').eq('series',title).eq('medium',medium).in('kind',['theory','reaction']).eq('status','approved').order('created_at',{ascending:false}).limit(60);
    const catalogPromise=searchCatalog(title,medium).catch(()=>[]);
    const [postResult,fans,summary,polls,mine]=await Promise.all([
      postQuery.then(response=>response.error?db.from('posts').select('id,title,body,kind,episode,spoiler,author,created_at,medium,series,media_path,media_type').eq('series',title).eq('medium',medium).in('kind',['theory','reaction']).order('created_at',{ascending:false}).limit(60):response),
      ready.drops||true?optional(()=>db.rpc('series_fans',{p_series:title,p_medium:medium})):null,
      ready.extras?optional(()=>db.rpc('series_score_summary',{p_series:title,p_medium:medium})):null,
      ready.polls?optional(()=>db.from('polls').select('post_id,question,options,week_start').eq('series',title).eq('medium',medium).eq('week_start',weekStart()).limit(1)):null,
      uid()?optional(()=>db.from('series_follows').select('progress').eq('user_id',uid()).eq('series',title).eq('medium',medium).maybeSingle()):null
    ]);
    if(!current())return;
    const posts=postResult.data||[];
    const earlyCatalog=item.cover||item.japanese?item:{};
    const match=earlyCatalog;
    const japanese=match.japanese&&match.japanese!==title?match.japanese:'';
    const numbers=posts.map(post=>Number(post.episode)||0).filter(Boolean);
    const latest=numbers.length?Math.max(...numbers):0;
    const length=medium==='manga'?match.chapters:match.episodes;
    const theories=posts.filter(post=>post.kind==='theory');
    const reviews=posts.filter(post=>post.kind==='reaction');
    const byNumber=new Map();
    for(const post of reviews){if(!post.episode)continue;if(!byNumber.has(post.episode))byNumber.set(post.episode,[]);byNumber.get(post.episode).push(post);}
    const scoreMap=new Map((summary||[]).map(row=>[row.episode,row]));
    const following=!!mine;
    const savedProgress=Number(mine?.progress);
    const progressValue=savedProgress>0?String(savedProgress):'';
    const cap=Number(length)>0?Number(length):'';
    const unit=medium==='manga'?'Chapter':'Episode';
    const poll=polls?.[0];
    const fanCount=Array.isArray(fans)?fans.length:0;
    async function tile(post){
      const past=!uid()?!!post.episode:(savedProgress>0&&post.episode>savedProgress);
      const hidden=post.spoiler||past;
      const url=!hidden&&post.media_path&&signed?await signed(post.media_path).catch(()=>''):'';
      const label=post.title||(post.episode?unitShort(medium)+' '+post.episode:'Post');
      return `<button type="button" class="series-tile" data-open-series-post="${post.id}" aria-label="${esc(label)}">${url?`<img src="${esc(url)}" alt="" loading="lazy">`:`<span>${esc(String(label).slice(0,42))}</span>`}</button>`;
    }
    const [postTiles,theoryTiles,reviewTiles]=await Promise.all([
      Promise.all(posts.map(tile)),
      Promise.all(theories.map(tile)),
      Promise.all(reviews.map(tile))
    ]);
    if(!current())return;
    const threadTiles=[...byNumber.keys()].sort((a,b)=>b-a).map(number=>{
      const stat=scoreMap.get(number);
      return `<button type="button" class="series-tile series-thread" data-open-drop="${number}"><strong>${unitShort(medium)} ${number}</strong><span>${byNumber.get(number).length}${stat?' · '+stat.average:''}</span></button>`;
    }).join('');
    const emptyTile=text=>`<p class="series-empty">${text}</p>`;
    host.innerHTML=`<section class="series-hub"><header class="series-hero">${match.cover?`<img class="series-cover" src="${esc(match.cover)}" alt="" loading="lazy">`:`<div class="series-cover series-cover-fallback" aria-hidden="true">${esc(title.slice(0,1))}</div>`}<div class="series-hero-copy"><h2>${esc(title)}</h2>${japanese?`<p class="series-jp" lang="ja">${esc(japanese)}</p>`:''}</div></header><button type="button" id="series-follow" class="primary series-follow">${following?'Following':'Follow series'}</button><div class="series-stats"><span><strong>${posts.length}</strong> posts</span><button type="button" id="series-fans-open"><strong>${fanCount}</strong> followers</button>${latest?`<span><strong>${unitShort(medium)} ${latest}</strong> latest</span>`:''}</div><button type="button" id="series-progress-open" class="series-progress-row"><span>Your progress</span><strong>${progressValue?unitShort(medium)+' '+progressValue:'Set'}</strong></button><div class="series-tabs" role="tablist" aria-label="Series sections"><button type="button" data-hub-tab="posts" aria-selected="true">Posts</button><button type="button" data-hub-tab="theories" aria-selected="false">Theories</button><button type="button" data-hub-tab="reviews" aria-selected="false">Reviews</button><button type="button" data-hub-tab="threads" aria-selected="false">Threads</button></div><div class="series-grid" data-hub-panel="posts">${postTiles.join('')||emptyTile('No posts yet.')}</div><div class="series-grid" data-hub-panel="theories" hidden>${theoryTiles.join('')||emptyTile('No theories yet. Theories stay separate from reviews.')}</div><div class="series-grid" data-hub-panel="reviews" hidden>${reviewTiles.join('')||emptyTile('No reviews yet.')}</div><div class="series-grid" data-hub-panel="threads" hidden>${threadTiles||emptyTile('The first review opens a thread.')}</div>${poll?`<button type="button" class="series-poll" data-open-series-post="${poll.post_id}">${esc(poll.question)}</button>`:''}</section><div id="series-progress-sheet" class="mini-sheet" hidden><button type="button" id="series-progress-backdrop" class="mini-sheet-backdrop" aria-label="Close progress"></button><form id="series-progress" class="mini-sheet-card"><div class="sheet-handle" aria-hidden="true"></div><h3>Your progress</h3><label>${unit}<input id="series-progress-input" type="number" min="0" ${cap?`max="${cap}"`:''} inputmode="numeric" placeholder="${unit}" value="${esc(progressValue)}"></label><p class="small">${cap?`Up to ${cap}. `:''}Posts past this stay blurred until you tap them.</p><button class="primary" type="submit">Save</button></form></div><div id="series-fans-sheet" class="mini-sheet" hidden><button type="button" id="series-fans-backdrop" class="mini-sheet-backdrop" aria-label="Close followers"></button><div class="mini-sheet-card"><div class="sheet-handle" aria-hidden="true"></div><h3>Followers</h3><div class="series-fan-list">${(fans||[]).map(person=>`<button type="button" data-series-fan="${person.id}"><strong>${esc(person.display_name||person.username)}</strong><span>@${esc(person.username)}</span></button>`).join('')||'<p class="small">'+(fans?'No followers yet.':'Followers show up after the fandom update.')+'</p>'}</div></div></div>`;
    host.querySelectorAll('[data-hub-tab]').forEach(button=>button.onclick=()=>{host.querySelectorAll('[data-hub-tab]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));host.querySelectorAll('[data-hub-panel]').forEach(panel=>{panel.hidden=panel.dataset.hubPanel!==button.dataset.hubTab;});});
    const openMini=id=>{const node=$('#'+id);if(node)node.hidden=false;};
    const closeMini=id=>{const node=$('#'+id);if(node)node.hidden=true;};
    $('#series-progress-open').onclick=()=>{if(!uid()){requireProfile();return;}openMini('series-progress-sheet');};
    $('#series-progress-backdrop').onclick=()=>closeMini('series-progress-sheet');
    $('#series-fans-open').onclick=()=>openMini('series-fans-sheet');
    $('#series-fans-backdrop').onclick=()=>closeMini('series-fans-sheet');
    $('#series-follow').onclick=async()=>{
      if(!requireProfile())return;
      $('#series-follow').disabled=true;
      try{
        if(following)await result(db.from('series_follows').delete().eq('user_id',uid()).eq('series',title).eq('medium',medium));
        else await result(db.from('series_follows').insert({user_id:uid(),series:title,medium,progress:0}));
        toast(following?'Unfollowed series.':'Following series.');
        await pageSeries(item,current);
      }catch(error){fail(error);$('#series-follow').disabled=false;}
    };
    $('#series-progress').onsubmit=async event=>{
      event.preventDefault();
      if(!requireProfile())return;
      const value=Number($('#series-progress-input').value);
      const limit=Number($('#series-progress-input').max);
      if(!Number.isFinite(value)||value<0){toast('Enter how far you are.');return;}
      if(limit&&value>limit){toast('This series is listed at '+limit+'.');return;}
      try{
        const saved=await db.rpc('set_series_progress',{p_series:title,p_medium:medium,p_progress:value});
        if(saved.error){
          if(missing(saved.error))await result(db.from('series_follows').upsert({user_id:uid(),series:title,medium,progress:value},{onConflict:'user_id,series,medium'}));
          else throw saved.error;
        }
        toast('Spoiler progress saved.');
        await pageSeries(item,current);
      }catch(error){fail(error);}
    };
    host.querySelectorAll('[data-open-series-post]').forEach(button=>button.onclick=()=>openPost(button.dataset.openSeriesPost));
    host.querySelectorAll('[data-open-drop]').forEach(button=>button.onclick=()=>openDrop(title,medium,button.dataset.openDrop));
    host.querySelectorAll('[data-series-fan]').forEach(button=>button.onclick=()=>showProfile(button.dataset.seriesFan));
    catalogPromise.then(rows=>{
      if(!current()||!host.isConnected)return;
      const found=(rows||[]).find(row=>row.title?.toLowerCase()===title.toLowerCase()&&row.medium===medium)||(rows||[])[0];
      if(!found)return;
      const cover=host.querySelector('.series-cover');
      if(found.cover&&cover&&cover.tagName!=='IMG')cover.outerHTML=`<img class="series-cover" src="${esc(found.cover)}" alt="" loading="lazy">`;
      else if(found.cover&&cover)cover.src=found.cover;
      const jp=found.japanese&&found.japanese!==title?found.japanese:'';
      if(jp&&!host.querySelector('.series-jp'))host.querySelector('.series-hero-copy h2')?.insertAdjacentHTML('afterend','<p class="series-jp" lang="ja">'+esc(jp)+'</p>');
      const count=Number(medium==='manga'?found.chapters:found.episodes);
      const input=$('#series-progress-input');
      if(input&&count>0){input.max=String(count);const note=input.closest('form')?.querySelector('.small');if(note)note.textContent='Up to '+count+'. Posts past this stay blurred until you tap them.';}
    }).catch(()=>{});
  }

  async function pageDrop(item,current){
    const title=item.title;
    const medium=item.medium==='manga'?'manga':'anime';
    const number=Number(item.number);
    const host=$('#content');
    $('#view-title').textContent=unitShort(medium)+' '+number;
    host.innerHTML='<section class="drop-thread"><div class="skeleton-line"></div><div class="skeleton-block tall"></div></section>';
    const response=await db.from('posts').select('id,title,body,kind,episode,author,created_at,spoiler,profiles!posts_author_fkey(username,display_name)').eq('series',title).eq('medium',medium).eq('episode',number).eq('kind','reaction').order('created_at',{ascending:false}).limit(50);
    const posts=response.error?[]:response.data||[];
    if(!current())return;
    const ready=await caps();
    let average=null;
    if(ready.extras&&posts.length){
      const extras=await optional(()=>db.from('post_extras').select('review_score').in('post_id',posts.map(post=>post.id)));
      const scores=(extras||[]).map(row=>row.review_score).filter(score=>score);
      if(scores.length)average=Math.round(scores.reduce((sum,score)=>sum+score,0)/scores.length*10)/10;
    }
    host.innerHTML=`<section class="drop-thread"><p class="small"><button type="button" id="drop-back-series" class="text-button">${esc(title)}</button></p><h2>${esc(title)} · ${unitShort(medium)} ${number}</h2><p class="series-tracker">${posts.length} ${posts.length===1?'review':'reviews'}${average!=null?' · avg '+average+'/10':''}</p><p class="small">${ready.drops?'Followers were notified when this thread opened.':'Follower alerts turn on after the fandom update. The thread still lists reviews.'}</p><div id="drop-posts">${posts.map(post=>`<button type="button" class="notice" data-open-series-post="${post.id}"><strong>${esc(post.title||'Review')}</strong><span class="meta">@${esc(post.profiles?.username||'fan')}</span></button>`).join('')||'<p class="small">No review yet. The first chapter or episode review creates this thread.</p>'}</div></section>`;
    $('#drop-back-series').onclick=()=>{history.pushState({view:'series'},'','/series/'+encodeURIComponent(title)+'?medium='+medium);document.dispatchEvent(new CustomEvent('fictioncom-route'));};
    host.querySelectorAll('[data-open-series-post]').forEach(button=>button.onclick=()=>openPost(button.dataset.openSeriesPost));
  }

  async function pageTag(item,current){
    const kind=item.kind==='arc'?'arc':'character';
    const name=item.name||'';
    const host=$('#content');
    $('#view-title').textContent=name;
    host.innerHTML='<section class="tag-page"><div class="skeleton-line"></div><div class="skeleton-block tall"></div></section>';
    const ready=await caps();
    let posts=[];
    if(ready.tags){
      const tags=await optional(()=>db.from('fandom_tags').select('id,name').eq('kind',kind).ilike('normalized',name.toLowerCase()).limit(5));
      const ids=(tags||[]).map(tag=>tag.id);
      if(ids.length){
        const links=await optional(()=>db.from('post_fandom_tags').select('post_id,posts(id,title,body,series,kind,episode,medium)').in('tag_id',ids).limit(40));
        posts=(links||[]).map(row=>row.posts).filter(Boolean);
      }
    }
    if(!posts.length){
      const like=name.replace(/[\\%_]/g,'\\$&');
      const response=await db.from('posts').select('id,title,body,series,kind,episode,medium').eq('status','approved').or('title.ilike.%'+like+'%,body.ilike.%'+like+'%').order('created_at',{ascending:false}).limit(30);
      posts=response.error?[]:response.data||[];
    }
    if(!current())return;
    host.innerHTML=`<section class="tag-page"><p class="eyebrow">${kind==='arc'?'Arc':'Character'}</p><h2>${esc(name)}</h2><div>${posts.map(post=>`<button type="button" class="notice" data-open-series-post="${post.id}"><strong>${esc(post.title||post.series||'Post')}</strong><span class="meta">${esc(post.series||post.kind||'')}</span></button>`).join('')||'<p class="small">Nothing is tagged with this yet.</p>'}</div></section>`;
    host.querySelectorAll('[data-open-series-post]').forEach(button=>button.onclick=()=>openPost(button.dataset.openSeriesPost));
  }

  async function topTheories({series,medium,page,limit}){
    const ready=await caps();
    if(!ready.votes)return null;
    const response=await db.rpc('top_theories',{p_series:series,p_medium:medium,page_number:page,limit_count:limit}).select('*,profiles!posts_author_fkey(*)');
    if(response.error)return null;
    return response.data||[];
  }
  async function postsOfType(type){
    const ready=await caps();
    if(!ready.extras)return null;
    const response=await db.from('post_extras').select('post_id').eq('post_type',type).limit(60);
    if(missing(response.error))return null;
    if(response.error)return [];
    return (response.data||[]).map(row=>row.post_id);
  }

  async function mountComposer(form){
    const ready=await caps();
    const select=form.querySelector('#post-kind');
    if(!select||form.querySelector('#fandom-fields'))return;
    if(ready.extras){
      select.insertAdjacentHTML('beforeend','<option value="fanart">Fan art</option><option value="cosplay">Cosplay</option>');
    }
    if(ready.polls)select.insertAdjacentHTML('beforeend','<option value="poll">Weekly poll</option>');
    const slot=document.createElement('div');
    slot.id='fandom-fields';
    form.querySelector('label:has(#series), #series')?.closest('label')?.insertAdjacentElement('afterend',slot);
    const sync=()=>{
      const kind=select.value;
      const bits=[];
      if(ready.extras&&kind.startsWith('reaction'))bits.push('<label>Score<select id="review-score"><option value="">Score</option>'+Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label>');
      if(ready.extras&&kind==='fanart')bits.push('<label>Original artist<input id="artist-credit" maxlength="80" required placeholder="Credit the original artist"></label>');
      if(kind==='fanart'||kind==='cosplay'||kind==='poll'||kind==='theory'||kind.startsWith('reaction')||kind==='post')bits.push('<label>Characters and arcs<input id="fandom-tags" maxlength="120" placeholder="Luffy, Egghead arc" autocomplete="off"></label><div id="fandom-tag-options" class="tag-suggest" hidden></div>'+(ready.tags?'':'<p class="small">Tag suggestions work now. They are saved on the post after the fandom update.</p>'));
      if(ready.extras)bits.push('<label class="check" id="manga-layout-wrap" hidden><input id="manga-layout" type="checkbox"> Manga panel layout</label>');
      if(ready.polls&&kind==='poll')bits.push('<label>Poll question<input id="poll-question" maxlength="140" value="Best chapter this week" required></label>'+[0,1,2,3].map(index=>'<label>Choice '+(index+1)+'<input class="poll-choice" maxlength="40" '+(index<2?'required':'')+'></label>').join(''));
      slot.innerHTML=bits.join('');
      const tagInput=slot.querySelector('#fandom-tags');
      if(tagInput)bindTagSuggest(tagInput,slot.querySelector('#fandom-tag-options'),()=>form.querySelector('#series')?.value||'');
      const layout=slot.querySelector('#manga-layout-wrap');
      const files=form.querySelector('#attachment-order');
      if(layout&&files)layout.hidden=files.children.length<2;
    };
    select.addEventListener('change',sync);
    sync();
    form.addEventListener('fandom-sync',sync);
  }
  function bindTagSuggest(input,box,series){
    let timer=0;
    input.addEventListener('input',()=>{
      clearTimeout(timer);
      timer=setTimeout(async()=>{
        const raw=input.value.split(',').pop().trim();
        if(raw.length<1){box.hidden=true;return;}
        const ready=await caps();
        let rows=SEED.filter(([kind,name])=>name.toLowerCase().startsWith(raw.toLowerCase())).map(([kind,name])=>({kind,name}));
        if(ready.tags){
          const remote=await optional(()=>db.rpc('suggest_fandom_tags',{q:raw,p_series:series().replace(/\s*\((Anime|Manga)\)\s*$/i,'').trim()}));
          if(remote?.length)rows=[...remote.map(row=>({kind:row.kind,name:row.name})),...rows];
        }
        const seen=new Set();
        rows=rows.filter(row=>{const key=row.kind+':'+row.name.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
        box.hidden=!rows.length;
        box.innerHTML=rows.map(row=>'<button type="button" data-suggest-kind="'+row.kind+'" data-suggest-name="'+esc(row.name)+'">'+esc(row.name)+' · '+row.kind+'</button>').join('');
        box.querySelectorAll('button').forEach(button=>button.onclick=()=>{
          const parts=input.value.split(',');
          parts.pop();
          parts.push(button.dataset.suggestName+(button.dataset.suggestKind==='arc'?' arc':''));
          input.value=parts.map(part=>part.trim()).filter(Boolean).join(', ')+', ';
          box.hidden=true;
          input.focus();
        });
      },180);
    });
  }
  function parseTags(value,series){
    return String(value||'').split(',').map(part=>part.trim()).filter(Boolean).slice(0,8).map(part=>{
      const arc=/arc$/i.test(part);
      const name=part.replace(/\s+arc$/i,'').trim();
      return {name,kind:arc?'arc':'character',series:series||''};
    }).filter(tag=>tag.name);
  }
  function readComposer(form){
    const kind=form.querySelector('#post-kind')?.value||'post';
    const series=form.querySelector('#series')?.value?.replace(/\s*\((Anime|Manga)\)\s*$/i,'').trim()||'';
    const choices=[...form.querySelectorAll('.poll-choice')].map(input=>input.value.trim()).filter(Boolean);
    return {
      postType:['fanart','cosplay','poll'].includes(kind)?kind:'post',
      artistCredit:form.querySelector('#artist-credit')?.value.trim()||'',
      layout:form.querySelector('#manga-layout')?.checked?'manga':null,
      reviewScore:Number(form.querySelector('#review-score')?.value)||null,
      tags:parseTags(form.querySelector('#fandom-tags')?.value,series),
      poll:kind==='poll'?{question:form.querySelector('#poll-question')?.value.trim()||'Best chapter this week',options:choices}:null
    };
  }
  function validateComposer(form){
    const meta=readComposer(form);
    if(form.querySelector('#artist-credit')&&meta.postType==='fanart'&&!meta.artistCredit)return 'Credit the original artist for fan art.';
    if(form.querySelector('#review-score')&&form.querySelector('#post-kind').value.startsWith('reaction')&&!meta.reviewScore)return 'Add a score from 1 to 10.';
    if(meta.postType==='poll'&&(!meta.poll||meta.poll.options.length<2))return 'Add a question and at least two choices.';
    return '';
  }
  async function savePost(id,meta,post){
    const ready=await caps();
    if(ready.extras&&(meta.postType!=='post'||meta.layout||meta.reviewScore||meta.artistCredit)){
      const saved=await db.from('post_extras').upsert({post_id:id,post_type:meta.postType||'post',artist_credit:meta.artistCredit||null,layout:meta.layout,review_score:meta.reviewScore},{onConflict:'post_id'});
      if(saved.error&&!missing(saved.error))throw saved.error;
    }
    if(ready.tags&&meta.tags?.length){
      const saved=await db.rpc('attach_post_tags',{target:id,tags:meta.tags});
      if(saved.error&&!missing(saved.error))throw saved.error;
    }else if(meta.tags?.length&&!ready.tags){
      toast('Tags will show on the post after the fandom update.');
    }
    if(ready.polls&&meta.poll){
      const saved=await db.from('polls').insert({post_id:id,series:post.series||null,medium:post.medium||null,question:meta.poll.question,options:meta.poll.options,week_start:weekStart()});
      if(saved.error&&!missing(saved.error))throw saved.error;
    }
    if(post.kind==='reaction'&&post.episode){
      const saved=await db.rpc('open_drop_thread',{p_series:post.series,p_medium:post.medium,p_number:post.episode});
      if(saved.error&&!missing(saved.error))throw saved.error;
    }
  }

  async function paintLibrary(node,id){
    if(!node)return;
    const ready=await caps();
    const [shelves,legacy,characters]=await Promise.all([
      ready.shelves?optional(()=>db.from('reading_shelves').select('*').eq('user_id',id).order('series')):null,
      optional(()=>db.from('profile_series').select('*').eq('user_id',id).order('series')),
      ready.characters?optional(()=>db.from('favorite_characters').select('*').eq('user_id',id).order('name')):null
    ]);
    if(!node.isConnected||node.dataset.owner!==id)return;
    const merged=new Map();
    for(const row of legacy||[]){
      if(['reading','watching','completed','dropped'].includes(row.shelf))merged.set(row.series+'\0'+row.medium,row);
    }
    for(const row of shelves||[])merged.set(row.series+'\0'+row.medium,row);
    const rows=[...merged.values()];
    node.innerHTML=SHELVES.map(([shelf,label])=>{
      const items=rows.filter(row=>row.shelf===shelf);
      return '<section><h3>'+label+'</h3><div class="shelf-chips">'+(items.map(row=>'<button type="button" class="shelf-chip" data-shelf-series="'+esc(row.series)+'" data-shelf-medium="'+esc(row.medium)+'">'+esc(row.series)+'</button>').join('')||'<span class="small">Nothing here yet.</span>')+'</div></section>';
    }).join('')+'<section><h3>Favorite characters</h3><div class="shelf-chips">'+((characters||[]).map(row=>'<span>'+esc(row.name)+(row.series?' · '+esc(row.series):'')+'</span>').join('')||'<span class="small">'+(ready.characters?'Add the characters you love.':'Favorite characters turn on after the fandom update.')+'</span>')+'</div></section>'+(id===uid()?'<button type="button" id="edit-shelves">Edit lists</button>':'');
    node.querySelectorAll('[data-shelf-series]').forEach(button=>button.onclick=()=>{history.pushState({view:'series'},'','/series/'+encodeURIComponent(button.dataset.shelfSeries)+'?medium='+button.dataset.shelfMedium);document.dispatchEvent(new CustomEvent('fictioncom-route'));});
    if($('#edit-shelves'))$('#edit-shelves').onclick=()=>editLibrary().catch(fail);
  }
  async function editLibrary(){
    if(!requireProfile())return;
    const ready=await caps();
    const rows=ready.shelves?await optional(()=>db.from('reading_shelves').select('*').eq('user_id',uid()).order('series'))||[]:[];
    const characters=ready.characters?await optional(()=>db.from('favorite_characters').select('*').eq('user_id',uid()).order('name'))||[]:[];
    modal(`<h2>Reading and watching</h2><form id="shelf-form"><label>List<select id="shelf-kind">${SHELVES.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('')}</select></label><label>Series<input id="shelf-series" required placeholder="Search anime or manga"></label><button class="primary">Add</button></form><div id="shelf-current">${rows.map((row,index)=>'<div class="person"><span>'+esc(row.series)+' · '+esc(row.shelf)+'</span><button type="button" data-remove-shelf="'+index+'">Remove</button></div>').join('')||'<p class="small">No series on your lists yet.</p>'}</div><h3>Favorite characters</h3>${ready.characters?`<form id="character-form"><label>Character<input id="character-name" maxlength="40" required></label><label>Series<input id="character-series" maxlength="120" placeholder="Optional"></label><button class="primary">Add character</button></form>`:'<p class="small">Favorite characters turn on after the fandom update.</p>'}<div>${characters.map((row,index)=>'<div class="person"><span>'+esc(row.name)+'</span><button type="button" data-remove-character="'+index+'">Remove</button></div>').join('')}</div><button type="button" id="done-shelves">Done</button>`);
    let selected=null;
    const picker=attachCatalog($('#shelf-series'),{getMedium:()=>$('#shelf-kind').value==='watching'?'anime':$('#shelf-kind').value==='reading'?'manga':null,onSelect:item=>selected=item,onClear:()=>selected=null});
    $('#shelf-kind').onchange=()=>{selected=null;picker.reset();};
    $('#shelf-form').onsubmit=guarded(async()=>{
      if(!selected)throw Error('Choose a series from the suggestions.');
      const shelf=$('#shelf-kind').value;
      if(!ready.shelves)throw Error('These lists turn on after the fandom update.');
      await result(db.from('reading_shelves').upsert({user_id:uid(),series:selected.title,medium:selected.medium,shelf,updated_at:new Date().toISOString()},{onConflict:'user_id,series,medium'}));
      if(shelf==='watching'||shelf==='reading')await result(db.from('series_follows').upsert({user_id:uid(),series:selected.title,medium:selected.medium,progress:0},{onConflict:'user_id,series,medium',ignoreDuplicates:true}));
      await editLibrary();
    });
    document.querySelectorAll('[data-remove-shelf]').forEach(button=>button.onclick=guarded(async()=>{
      const row=rows[Number(button.dataset.removeShelf)];
      await result(db.from('reading_shelves').delete().eq('user_id',uid()).eq('series',row.series).eq('medium',row.medium));
      await editLibrary();
    }));
    if($('#character-form'))$('#character-form').onsubmit=guarded(async()=>{
      await result(db.from('favorite_characters').insert({user_id:uid(),name:$('#character-name').value.trim(),series:$('#character-series').value.trim()}));
      await editLibrary();
    });
    document.querySelectorAll('[data-remove-character]').forEach(button=>button.onclick=guarded(async()=>{
      const row=characters[Number(button.dataset.removeCharacter)];
      await result(db.from('favorite_characters').delete().eq('id',row.id).eq('user_id',uid()));
      await editLibrary();
    }));
    $('#done-shelves').onclick=async()=>{close();if(uid())showProfile(uid());};
  }

  async function paintDropNotices(scroll){
    const ready=await caps();
    if(!ready.drop_notices||!uid()||!scroll)return;
    const rows=await optional(()=>db.from('drop_notices').select('*').eq('recipient',uid()).order('created_at',{ascending:false}).limit(15));
    if(!rows?.length||!scroll.isConnected)return;
    const html='<section class="notif-group"><h3>New chapters</h3>'+rows.map(row=>'<div class="notice ig-note'+(row.read_at?'':' unread')+'"><button type="button" class="note-main" data-drop-notice="'+row.id+'" data-drop-series="'+esc(row.series)+'" data-drop-medium="'+esc(row.medium)+'" data-drop-number="'+row.number+'"><span class="note-copy"><strong>'+esc(row.series)+'</strong> '+esc(unitShort(row.medium)+' '+row.number+' thread is open')+'</span></button></div>').join('')+'</section>';
    scroll.insertAdjacentHTML('afterbegin',html);
    scroll.querySelectorAll('[data-drop-notice]').forEach(button=>button.onclick=async()=>{
      await db.from('drop_notices').update({read_at:new Date().toISOString()}).eq('id',button.dataset.dropNotice).eq('recipient',uid());
      openDrop(button.dataset.dropSeries,button.dataset.dropMedium,button.dataset.dropNumber);
    });
  }

  async function calledItCount(id){
    const ready=await caps();
    if(!ready.calls)return null;
    return optional(()=>db.rpc('called_it_count',{target:id}));
  }

  function layoutFor(post){return pack.get(post?.id)?.layout||null;}
  function called(id){return !!pack.get(id)?.called;}

  return {caps,annotate,cardBits,decorate,pageSeries,pageDrop,pageTag,topTheories,postsOfType,mountComposer,readComposer,validateComposer,savePost,paintLibrary,editLibrary,paintDropNotices,calledItCount,layoutFor,called,openDrop,openTag};
}
