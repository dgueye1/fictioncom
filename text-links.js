const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Turn escaped plain text into HTML with #hashtag and @mention buttons. */
export function linkify(text){
  return escape(text)
    .replace(/(^|[^&\w])#([A-Za-z][A-Za-z0-9_]{1,39})/g,'$1<button type="button" class="tag-link" data-hashtag="$2">#$2</button>')
    .replace(/(^|[^@\w])@([a-z0-9_]{3,24})(?![a-z0-9_])/gi,(match,pre,name)=>`${pre}<button type="button" class="mention-link" data-mention="${name.toLowerCase()}">@${name}</button>`);
}

/** Lightweight @mention suggestions under a textarea. `search` returns profile rows. */
export function attachMentionSearch(input, {search}={}){
  if(!input||!search||input.dataset.mentions==='on')return;
  input.dataset.mentions='on';
  const host=input.parentElement||input;
  if(getComputedStyle(host).position==='static')host.style.position='relative';
  const box=document.createElement('div');
  box.className='mention-box';
  box.hidden=true;
  box.setAttribute('role','listbox');
  input.after(box);
  let timer=0, epoch=0;
  const hide=()=>{box.hidden=true;box.innerHTML='';};
  const token=()=>{
    const pos=input.selectionStart??0;
    const match=input.value.slice(0,pos).match(/(^|\s)@([a-z0-9_]{1,24})$/i);
    return match?{query:match[2],start:pos-match[2].length-1,end:pos}:null;
  };
  input.addEventListener('input',()=>{
    const found=token();
    if(!found||found.query.length<1){hide();return;}
    const request=++epoch;
    clearTimeout(timer);
    timer=setTimeout(async()=>{
      try{
        const rows=await search(found.query);
        if(request!==epoch||!input.isConnected)return;
        const people=(rows||[]).slice(0,6);
        if(!people.length){hide();return;}
        box.hidden=false;
        box.innerHTML=people.map(p=>`<button type="button" role="option" data-username="${escape(p.username)}"><strong>@${escape(p.username)}</strong><span>${escape(p.display_name||'')}</span></button>`).join('');
        box.querySelectorAll('button').forEach(button=>button.onclick=()=>{
          const current=token();
          const name=button.dataset.username;
          if(!current||!name){hide();return;}
          input.setRangeText('@'+name+' ',current.start,current.end,'end');
          input.dispatchEvent(new Event('input',{bubbles:true}));
          hide();
          input.focus();
        });
      }catch{hide();}
    },180);
  });
  input.addEventListener('blur',()=>setTimeout(hide,160));
  input.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
}
