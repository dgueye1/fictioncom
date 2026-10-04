export function createSearch({db,esc,showProfile,openPost,messagePerson,getUser}){
 const form=document.createElement('form');form.className='site-search';form.hidden=true;
 form.innerHTML='<label for="site-search-query">Search</label><div class="site-search-row"><input id="site-search-query" type="search" maxlength="100" autocomplete="off" placeholder="Search posts or people"><button type="submit">Search</button><button type="button" id="site-search-clear" hidden>Clear</button></div><div class="search-kinds" role="tablist" aria-label="Search results"><button type="button" data-search-kind="posts" role="tab" aria-selected="true">Posts</button><button type="button" data-search-kind="people" role="tab" aria-selected="false">People</button></div><div id="site-search-results" aria-live="polite" hidden></div>';
 document.querySelector('.section-heading').after(form);
 const input=form.querySelector('input'),results=form.querySelector('#site-search-results'),clear=form.querySelector('#site-search-clear'),kinds=form.querySelector('.search-kinds');
 let view='feed',kind='posts',generation=0,timer;
 const unique=rows=>[...new Map(rows.map(row=>[row.id,row])).values()];
 async function search(){
  clearTimeout(timer);const current=++generation,text=input.value.trim(),selectedView=view,selectedKind=kind;
  clear.hidden=!text;results.hidden=!text;
  if(!text){results.innerHTML='';return;}
  if(text.length<2){results.textContent='Type at least two characters to search.';return;}
  results.textContent='Searching…';
  // Separate ilike queries avoid embedding user text in PostgREST filter expressions.
  const pattern='%'+text.replace(/[\\%_]/g,'\\$&')+'%';
  try{
   const fields=kind==='people'?['username','display_name']:['title','body','series'];
   const groups=await Promise.all(fields.map(async field=>{
    let query=db.from(kind==='people'?'profiles':'posts').select(kind==='people'?'id,username,display_name':'id,title,series,kind,medium,created_at,spoiler').ilike(field,pattern);
    if(kind==='people'){query=query.eq('account_suspended',false).order('username');if(view==='messages'&&getUser())query=query.neq('id',getUser().id);}
    else {query=query.eq('status','approved').not('kind','in','(avatar,story)');if(view==='theory')query=query.eq('kind','theory');if(view==='episodes'||view==='chapters')query=query.eq('kind','reaction').eq('medium',view==='episodes'?'anime':'manga');query=query.order('created_at',{ascending:false});}
    const {data,error}=await query.limit(20);if(error)throw error;return data;
   }));
   if(current!==generation||selectedView!==view||selectedKind!==kind)return;
   const rows=unique(groups.flat()).slice(0,20);
   results.innerHTML=rows.length?'<p class="small">'+rows.length+' '+(kind==='people'?(rows.length===1?'person':'people'):(rows.length===1?'post':'posts'))+' found'+(rows.length===20?' · refine your search for more':'')+'</p>'+rows.map(row=>kind==='people'?`<button type="button" class="search-result" data-search-id="${esc(row.id)}"><strong>${esc(row.display_name)}</strong><span class="meta">@${esc(row.username)}${view==='messages'?' · Message':''}</span></button>`:`<button type="button" class="search-result" data-search-id="${esc(row.id)}"><strong>${esc(row.spoiler?'Spoiler · '+(row.series||'Community post'):row.title||row.series||'Community post')}</strong><span class="meta">${esc(row.kind==='reaction'?(row.medium==='manga'?'Chapter':'Episode'):row.kind)}${row.series?' · '+esc(row.series):''}</span></button>`).join(''):'<p class="small">No '+(kind==='people'?'people':'posts')+' found. Try another name or keyword.</p>';
   results.querySelectorAll('[data-search-id]').forEach(button=>button.onclick=async()=>{const row=rows.find(r=>r.id===button.dataset.searchId);try{if(selectedKind==='people'){if(selectedView==='messages')await messagePerson(row);else await showProfile(row.id);}else await openPost(row.id);}catch{results.textContent='Could not open this result. Please try again.';}});
  }catch{if(current===generation)results.textContent='Search is unavailable right now. Please try again.';}
 }
 function paintKinds(){form.querySelectorAll('[data-search-kind]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.searchKind===kind)));}
 form.onsubmit=event=>{event.preventDefault();search();};
 input.oninput=()=>{generation++;clearTimeout(timer);results.hidden=!input.value.trim();results.textContent=input.value.trim().length>=2?'Searching…':'Type at least two characters to search.';clear.hidden=!input.value.trim();timer=setTimeout(search,300);};
 clear.onclick=()=>{input.value='';search();input.focus();};
 form.querySelectorAll('[data-search-kind]').forEach(button=>button.onclick=()=>{kind=button.dataset.searchKind;paintKinds();search();});
 return {sync(nextView){if(view!==nextView){generation++;clearTimeout(timer);input.value='';results.innerHTML='';results.hidden=true;clear.hidden=true;kind=nextView==='messages'?'people':'posts';}view=nextView;form.hidden=view==='profile';kinds.hidden=view==='messages';input.placeholder=view==='messages'?'Search people to message':'Search posts or people';form.querySelector('label').textContent=view==='messages'?'Search people':'Search posts or people';paintKinds();}};
}
