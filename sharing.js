const PUBLIC_ORIGIN='https://fictioncom.com';
export function postUrl(id){return PUBLIC_ORIGIN+'/p/'+id;}
export function sharedBody(body,render){return render(body).replace(/\[share:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi,(_,id)=>`<button type="button" class="shared-content" data-shared-content="${id}"><span aria-hidden="true">↗</span> View shared post or story <span aria-hidden="true">›</span></button>`);}

export function createSharing({db,result,esc,requireProfile,uid,fail,toast,openPost,openStoryPost,avatar,openSheet,closeSheet,shareToStory}){
  async function open(id){const post=await result(db.from('posts').select('*,profiles!posts_author_fkey(*)').eq('id',id).maybeSingle());if(!post||post.status!=='approved'||post.expires_at&&Date.parse(post.expires_at)<=Date.now()){toast('This post or story is no longer available.');return;}if(post.kind==='story')await openStoryPost(post);else await openPost(id);}
  function sheet(){return document.querySelector('#share-sheet-body');}
  async function share(id){
    const pause=document.querySelector('#pause-story');
    if(pause&&pause.dataset.paused!=='true')pause.click();
    const url=postUrl(id);
    openSheet('share');
    const body=sheet();
    if(!body)return;
    body.dataset.url=url;body.innerHTML='<label class="sr-only" for="share-search">Search</label><input id="share-search" placeholder="Search" autocomplete="off"><div id="share-recents" class="share-recents" aria-label="Recent people"></div><div id="share-results" class="share-results"></div><div class="share-grid"><button type="button" id="copy-share-link">Copy link</button><button type="button" id="native-share">Share</button><button type="button" id="share-to-story">Share to story</button></div>';
    body.querySelector('#copy-share-link').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('Link copied.');}catch{toast(url);}};
    const native=body.querySelector('#native-share');
    if(!navigator.share)native.hidden=true;
    else native.onclick=async()=>{try{await navigator.share({title:'FictionCom',text:'A post on FictionCom',url});}catch(error){if(error?.name!=='AbortError')fail(error);}};
    body.querySelector('#share-to-story').onclick=async()=>{try{await shareToStory(id);closeSheet();}catch(error){fail(error);}};
    if(!uid()){body.querySelector('#share-recents').innerHTML='<p class="small">Sign in to send this in Direct.</p>';return;}
    const follows=await result(db.from('follows').select('following').eq('follower',uid()).eq('accepted',true));
    const ids=follows.map(row=>row.following);
    let people=ids.length?await result(db.from('profiles').select('id,username,display_name,avatar_path').in('id',ids).limit(16)): [];
    const draw=rows=>{
      const host=body.querySelector('#share-recents');
      if(!host)return;
      host.innerHTML=rows.length?rows.map(person=>`<button type="button" class="share-person" data-share-recipient="${person.id}"><span class="avatar">${esc((person.display_name||person.username||'?')[0].toUpperCase())}</span><span>${esc(person.username||person.display_name)}</span></button>`).join(''):'<p class="small">People you follow show up here.</p>';
      host.querySelectorAll('[data-share-recipient]').forEach(button=>button.onclick=()=>send(button));
    };
    async function send(button){
      button.disabled=true;
      try{
        const sent=await result(db.rpc('share_to_chat',{target_post:id,target_recipient:button.dataset.shareRecipient}));
        closeSheet();
        toast(sent.state==='pending'?'Shared as a message request.':'Sent in Direct.');
      }catch(error){button.disabled=false;fail(error);}
    }
    draw(people);
    if(avatar){
      const pictured=await Promise.all(people.slice(0,12).map(async person=>{
        const picture=await avatar(person);
        return `<button type="button" class="share-person" data-share-recipient="${person.id}">${picture}<span>${esc(person.username||person.display_name)}</span></button>`;
      }));
      const host=body.querySelector('#share-recents');
      if(host&&pictured.length){host.innerHTML=pictured.join('');host.querySelectorAll('[data-share-recipient]').forEach(button=>button.onclick=()=>send(button));}
    }
    let epoch=0,timer;
    body.querySelector('#share-search').oninput=event=>{
      clearTimeout(timer);
      const query=event.target.value.trim().replace(/[%_]/g,'');
      const request=++epoch;
      const results=body.querySelector('#share-results');
      if(query.length<2){results.innerHTML='';return;}
      timer=setTimeout(async()=>{
        try{
          const rows=await result(db.from('profiles').select('id,username,display_name,avatar_path').ilike('username',query+'%').neq('id',uid()).limit(12));
          if(request!==epoch)return;
          results.innerHTML=rows.map(person=>`<button type="button" class="share-result" data-share-recipient="${person.id}"><strong>${esc(person.username)}</strong><span>${esc(person.display_name||'')}</span></button>`).join('')||'<p class="small">No one with that username.</p>';
          results.querySelectorAll('[data-share-recipient]').forEach(button=>button.onclick=()=>send(button));
        }catch(error){fail(error);}
      },200);
    };
  }
  async function shareLink(payload){
    openSheet('share');
    const body=sheet();
    if(!body)return;
    body.innerHTML=`<p class="small">${esc(payload.url)}</p><div class="share-grid"><button type="button" id="copy-share-link">Copy link</button><button type="button" id="native-share">Share</button></div>`;
    body.querySelector('#copy-share-link').onclick=async()=>{try{await navigator.clipboard.writeText(payload.url);toast('Link copied.');}catch{toast(payload.url);}};
    const native=body.querySelector('#native-share');
    if(!navigator.share)native.hidden=true;
    else native.onclick=async()=>{try{await navigator.share(payload);}catch(error){if(error?.name!=='AbortError')fail(error);}};
  }
  return {share,open,shareLink,postUrl};
}
