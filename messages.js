import {sharedBody} from './sharing.js';
import {attachRichComposer,composerBody,clearComposer,renderRichBody} from './rich-replies.js';
import {igIcon,relTime} from './instagram.js';
export function createMessages({openShared,db,$,esc,result,requireProfile,getUser,avatar,showProfile,fail,getStories=async()=>[],openStory,storySeen=()=>false,separateWindow=false}){
 let tab='following',active=new URLSearchParams(location.search).get('chat'),threads=[],follows=new Set(),epoch=0,timer,stories=[];
 const uid=()=>getUser()?.id;
 const readMarkers=new Map();
 void separateWindow;
 const readKey=()=>'fictioncom-chat-read:'+(uid()||'guest');
 const readMap=()=>{try{const value=JSON.parse(localStorage.getItem(readKey())||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}};
 const rememberRead=(thread,message)=>{const map=readMap();map[thread]=message;readMarkers.set(thread,message);try{localStorage.setItem(readKey(),JSON.stringify(map));}catch{}};
 const messageReaction=m=>`<button type="button" class="chat-message-like" data-like-message="${esc(m.id)}" aria-label="Like message" aria-pressed="false">♡</button>`;
 const mobile=()=>matchMedia('(max-width:760px)').matches;
 const other=t=>t.requester===uid()?t.recipient_profile:t.requester_profile;
 function snippet(body,mine){
  if(!body)return mine?'You sent a message':'';
  let text=String(body).replace(/\[share:[0-9a-f-]{36}\]/gi,'Shared a post').replace(/\[gif:[^\]]+\]/gi,'Sent a GIF').replace(/\s+/g,' ').trim();
  if(text.length>64)text=text.slice(0,64).trimEnd()+'…';
  return (mine?'You: ':'')+text;
 }
 function dividerLabel(iso){
  const d=new Date(iso),now=new Date();
  if(d.toDateString()===now.toDateString())return d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  const yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
  if(d.toDateString()===yesterday.toDateString())return 'Yesterday';
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:d.getFullYear()!==now.getFullYear()?'numeric':undefined});
 }
 function syncShell(open){
  document.body.classList.toggle('dm-open',!!open&&mobile());
  const thread=$('#message-chat');
  if(!thread)return;
  const focused=document.body.classList.contains('chat-window');
  thread.hidden=mobile()&&!open&&!focused?true:false;
 }
 function inboxTitle(){const name=$('#account')?.textContent?.trim();if(!name||name==='Sign in'||name==='Set up profile')return 'Messages';return name;}
 async function refreshLikes(history){const ids=[...history.querySelectorAll('[data-like-message]')].map(b=>b.dataset.likeMessage);if(!ids.length)return;const likes=await result(db.from('direct_message_likes').select('message_id,user_id').in('message_id',ids));if(!history.isConnected)return;history.querySelectorAll('[data-like-message]').forEach(b=>{if(b.dataset.busy)return;const matches=likes.filter(l=>l.message_id===b.dataset.likeMessage),liked=matches.some(l=>l.user_id===uid());b.setAttribute('aria-pressed',String(liked));b.setAttribute('aria-label',liked?'Unlike message':'Like message');b.classList.toggle('liked',matches.length>0);b.textContent=(matches.length?'♥':'♡')+(matches.length?' '+matches.length:'');});}
 async function badge(){const node=$('#chat-unread-badge');if(!node)return;const userId=uid();if(!userId){node.hidden=true;node.textContent='';return;}const response=await db.rpc('chat_unread_count');if(response.error||uid()!==userId)return;const count=Number(response.data)||0;node.hidden=count===0;const text=count>99?'99+':String(count);if(node.textContent!==text)node.textContent=text;const button=node.closest('button');button?.setAttribute('aria-label',count?`Chat, ${count} unread messages`:'Chat');}
 async function markRead(id,rows){const last=rows.at(-1);if(!last||document.hidden||active!==id||readMap()[id]===last.id)return;const response=await db.rpc('mark_chat_read',{target_thread:id,through_message:last.id});if(!response.error){rememberRead(id,last.id);document.querySelector(`[data-thread="${CSS.escape(id)}"]`)?.closest('.message-person')?.classList.remove('unread');document.querySelector(`[data-thread="${CSS.escape(id)}"] .ig-unread-dot`)?.remove();await badge();}}
 setInterval(()=>{if(!document.hidden)badge().catch(console.error);},5000);
 function enterToSend(input,form){input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(form.querySelector('button.primary')?.disabled)return;try{if(composerBody(input))form.requestSubmit();}catch(error){fail(error);}}});}
 function stop(){clearTimeout(timer);epoch++;document.body.classList.remove('dm-open');$('#new-message-dialog')?.close();}
 function shell(guest){
  return `<section class="messages ig-dm"><div class="ig-dm-side"><div class="message-heading ig-dm-head"><h2>${esc(guest?'Messages':inboxTitle())}</h2><button id="${guest?'guest-new-chat':'new-message'}" class="ig-icon-btn" aria-label="New message">${igIcon('compose')}</button></div><label class="message-search"><span class="sr-only">Search</span><input id="message-search" placeholder="Search" ${guest?'disabled':''}></label><div class="message-tabs" role="tablist"><button type="button" data-${guest?'guest-':''}inbox="following" role="tab">Primary</button><button type="button" data-${guest?'guest-':''}inbox="requests" role="tab">Requests</button></div><div id="message-list"></div></div><section id="message-chat" class="ig-dm-thread" hidden></section></section>`;
 }
 function emptyThread(){return `<div class="ig-dm-empty"><div class="ig-dm-mark" aria-hidden="true">${igIcon('compose')}</div><h2>Your messages</h2><p>Send private photos, posts, and notes to people you follow.</p><button type="button" id="empty-new-message" class="primary">Send message</button></div>`;}
 async function inbox(){
  const savedActive=active;stop();active=savedActive;if(!uid()){
   $('#content').innerHTML=shell(true);
   const paint=()=>{document.querySelectorAll('[data-guest-inbox]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.guestInbox===tab)));$('#message-list').innerHTML=`<div class="empty"><h2>${tab==='following'?'Primary':'Requests'}</h2><p id="guest-chat-description"></p><button id="guest-chat-signin" class="primary">Sign in or create account</button></div>`;$('#guest-chat-description').textContent=tab==='following'?'Chat with the people you follow. Sign in or create an account to start a conversation.':'Message requests from other people show up here.';$('#guest-chat-signin').onclick=()=>requireProfile();};
   document.querySelectorAll('[data-guest-inbox]').forEach(b=>b.onclick=()=>{tab=b.dataset.guestInbox;paint();});
   $('#guest-new-chat').onclick=()=>requireProfile();paint();$('#message-chat').innerHTML=`<div class="ig-dm-empty"><div class="ig-dm-mark" aria-hidden="true">${igIcon('compose')}</div><h2>Your messages</h2><p>Sign in to send photos, posts, and notes.</p><button type="button" id="guest-thread-signin" class="primary">Sign in</button></div>`;$('#guest-thread-signin').onclick=()=>requireProfile();syncShell(false);return;
  }if(!requireProfile()){$('#content').innerHTML='<div class="empty"><h2>Your private conversations</h2><p>Sign in to send and receive messages.</p></div>';return;}
  const request=epoch;
  $('#content').innerHTML=shell(false);
  $(`[data-inbox="${tab}"]`).setAttribute('aria-selected','true');
  document.querySelectorAll('[data-inbox]').forEach(b=>b.onclick=()=>{tab=b.dataset.inbox;active=null;inbox().catch(fail);});
  $('#new-message').onclick=newMessage;
  $('#message-search').oninput=()=>drawList().catch(fail);
  syncShell(false);
  try{
   const [rows,relations]=await Promise.all([result(db.from('direct_threads').select('*,requester_profile:profiles!direct_threads_requester_fkey(*),recipient_profile:profiles!direct_threads_recipient_fkey(*)').order('updated_at',{ascending:false})),result(db.from('follows').select('following').eq('follower',uid()).eq('accepted',true))]);
   if(request!==epoch)return;threads=rows;follows=new Set(relations.map(r=>r.following));stories=await getStories([...new Set(rows.map(t=>other(t)?.id).filter(Boolean))]);if(request!==epoch)return;await drawList();if(active)await chat(active);else showEmpty();
   if(!active)scheduleInboxCheck(request);
  }catch(e){if(request!==epoch)return;$('#message-list').innerHTML='<p class="small">Messaging setup is not active yet. Please try again after the database setup is completed.</p>';console.error(e);}
 }
 function showEmpty(){const thread=$('#message-chat');if(!thread)return;thread.innerHTML=emptyThread();syncShell(false);const button=$('#empty-new-message');if(button)button.onclick=newMessage;}
 function scheduleInboxCheck(request){timer=setTimeout(async()=>{if(request!==epoch||active||!$('#message-list'))return;try{const rows=await result(db.from('direct_threads').select('*,requester_profile:profiles!direct_threads_requester_fkey(*),recipient_profile:profiles!direct_threads_recipient_fkey(*)').order('updated_at',{ascending:false}));if(request!==epoch||active)return;if(JSON.stringify(rows)!==JSON.stringify(threads)){threads=rows;await drawList();}}catch(e){console.error(e);}if(request===epoch&&!active)scheduleInboxCheck(request);},15000);}
 async function latestFor(rows){
  const entries=await Promise.all(rows.map(async t=>{try{const msg=await result(db.from('direct_messages').select('id,sender,body,created_at').eq('thread_id',t.id).order('created_at',{ascending:false}).limit(1));return [t.id,msg[0]||null];}catch{return [t.id,null];}}));
  return new Map(entries);
 }
 function paintHistory(history,rows,avatarHtml){
  const atBottom=history.scrollHeight-history.scrollTop-history.clientHeight<80;
  const prevTop=history.scrollTop,prevHeight=history.scrollHeight;
  let html='',prev=0;
  rows.forEach((m,i)=>{
   const t=Date.parse(m.created_at);
   if(!prev||t-prev>15*60*1000||new Date(t).toDateString()!==new Date(prev).toDateString())html+=`<div class="ig-day"><time>${esc(dividerLabel(m.created_at))}</time></div>`;
   const mine=m.sender===uid();
   const next=rows[i+1];
   const grouped=next&&next.sender===m.sender&&Date.parse(next.created_at)-t<5*60*1000;
   html+=`<div data-message-id="${esc(m.id)}" class="message-row ${mine?'mine':'theirs'}"><span class="dm-avatar ${mine||grouped?'dm-avatar-spacer':''}">${mine||grouped?'':avatarHtml}</span><div class="message-stack"><div class="message-bubble ${mine?'sent':'received'}" title="${esc(new Date(m.created_at).toLocaleString())}"><div class="message-body">${sharedBody(m.body,renderRichBody)}</div></div>${messageReaction(m)}</div></div>`;
   prev=t;
  });
  history.innerHTML=html||'<p class="small ig-day">Say hello.</p>';
  if(atBottom||prevHeight<40)history.scrollTop=history.scrollHeight;else history.scrollTop=Math.max(0,prevTop+(history.scrollHeight-prevHeight));
 }
 async function drawList(){const list=$('#message-list');if(!list)return;const drawEpoch=epoch;const search=($('#message-search')?.value||'').toLowerCase();const rows=threads.filter(t=>{const p=other(t);return p&&(tab==='following'?follows.has(p.id):!follows.has(p.id))&&(`${p.display_name} ${p.username}`).toLowerCase().includes(search);});const latest=await latestFor(rows);if(drawEpoch!==epoch||!list.isConnected)return;const reads=readMap();const html=(await Promise.all(rows.map(async t=>{const p=other(t);const story=stories.find(s=>s.author===p.id);const msg=latest.get(t.id);const unread=!!(msg&&msg.sender!==uid()&&reads[t.id]!==msg.id);return `<div class="message-person${unread?' unread':''}${active===t.id?' is-active':''}"><button type="button" class="chat-avatar ${story?'has-story':''} ${story&&storySeen(p.id)?'seen-story':''}" data-chat-avatar="${p.id}" ${story?`data-chat-story="${story.id}"`:''} aria-label="${story?'Watch story by':'View profile of'} ${esc(p.display_name)}">${await avatar(p)}</button><button type="button" class="chat-conversation" data-thread="${t.id}"><span class="chat-person-details"><span class="chat-profile-name">${esc(p.display_name)}</span><span class="chat-snippet">${esc(msg?snippet(msg.body,msg.sender===uid()):t.state==='pending'?(t.recipient===uid()?'Message request':'Request sent'):'Conversation')}</span></span><span class="chat-row-meta"><time>${esc(relTime(msg?.created_at||t.updated_at))}</time>${unread?'<span class="ig-unread-dot" aria-label="Unread"></span>':''}</span></button></div>`;}))).join('')||'<p class="small ig-dm-none">No conversations here yet.</p>';if(drawEpoch!==epoch||!list.isConnected)return;list.innerHTML=html;list.querySelectorAll('[data-chat-avatar]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(b.dataset.chatStory&&openStory)openStory(b.dataset.chatStory).catch(fail);else showProfile(b.dataset.chatAvatar).catch(fail);});list.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>chat(b.dataset.thread).catch(fail));}
 async function chat(id){
  clearTimeout(timer);active=id;const t=threads.find(t=>t.id===id);if(!t){active=null;const list=$('#message-list');if(list&&new URLSearchParams(location.search).get('chat')===id)list.insertAdjacentHTML('afterbegin','<p class="small">That conversation is no longer available.</p>');showEmpty();return;}
  const p=other(t);if(!p)return;const node=$('#message-chat');if(!node)return;
  document.querySelectorAll('.message-person').forEach(row=>row.classList.toggle('is-active',row.querySelector(`[data-thread="${CSS.escape(id)}"]`)));
  const rows=await result(db.from('direct_messages').select('*').eq('thread_id',id).order('created_at',{ascending:false}).limit(100));
  if(active!==id||!node.isConnected)return;
  const story=stories.some(s=>s.author===p.id);
  const avatarHtml=await avatar(p);
  if(active!==id||!node.isConnected)return;
  node.hidden=false;syncShell(true);
  node.innerHTML=`<div class="ig-thread-bar"><button type="button" id="dm-back" aria-label="Back to messages">${igIcon('chevL')}</button><button type="button" id="popup-chat-avatar" class="chat-avatar ${story?'has-story':''} ${storySeen(p.id)?'seen-story':''}" aria-label="${story?'Watch story by':'View profile of'} ${esc(p.display_name)}">${avatarHtml}</button><button type="button" id="message-profile" class="chat-window-person"><span><strong>${esc(p.display_name)}</strong><span class="meta">@${esc(p.username)}</span></span></button></div><div class="message-history"></div>${t.state==='pending'?t.recipient===uid()?'<p class="small ig-request-note">Accept this request to reply. Denying removes it.</p><div class="form-actions ig-request-actions"><button type="button" id="accept-message" class="primary">Accept</button><button type="button" id="deny-message">Delete</button></div>':'<p class="small ig-request-note">Waiting for them to accept your message request.</p>':'<form id="direct-message-form" class="message-composer"><label class="sr-only" for="direct-message-body">Message</label><textarea id="direct-message-body" maxlength="2000" rows="1" required placeholder="Message…"></textarea><button class="primary" aria-label="Send">Send</button></form>'}`;
  const history=node.querySelector('.message-history');
  paintHistory(history,(rows||[]).slice().reverse(),avatarHtml);
  $('#dm-back').onclick=()=>{active=null;document.body.classList.remove('dm-open','chat-window');const url=new URL(location.href);if(url.searchParams.has('chat')){url.searchParams.delete('chat');historyReplace(url);}document.querySelectorAll('.message-person').forEach(row=>row.classList.remove('is-active'));showEmpty();scheduleInboxCheck(epoch);};
  $('#popup-chat-avatar').onclick=()=>{const found=stories.find(s=>s.author===p.id);if(found&&openStory)openStory(found.id).catch(fail);else showProfile(p.id).catch(fail);};
  $('#message-profile').onclick=()=>showProfile(p.id).catch(fail);
  if($('#accept-message'))for(const [selector,accept] of [['#accept-message',true],['#deny-message',false]])$(selector).onclick=async()=>{try{await result(db.rpc('resolve_message_request',{target_thread:id,accept_request:accept}));active=accept?id:null;await inbox();}catch(e){fail(e);}};
  const ordered=rows.slice().reverse();
  if($('#direct-message-form')){
   $('#direct-message-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button.primary'),input=$('#direct-message-body');button.disabled=true;try{await result(db.rpc('send_direct_message',{target:p.id,message_body:composerBody(input)}));const fresh=(await result(db.from('direct_messages').select('*').eq('thread_id',id).order('created_at',{ascending:false}).limit(100))).reverse();if(active===id&&node.isConnected){clearComposer(input);paintHistory(history,fresh,avatarHtml);history.scrollTop=history.scrollHeight;if(!mobile())input.focus();}}catch(e){fail(e);}finally{button.disabled=false;}};
   enterToSend($('#direct-message-body'),$('#direct-message-form'));attachRichComposer($('#direct-message-body'));
   if(!mobile())$('#direct-message-body').focus();
  }
  history.onclick=async e=>{const reaction=e.target.closest('[data-like-message]');if(reaction){if(t.state!=='accepted')return;reaction.disabled=true;reaction.dataset.busy='true';try{await result(db.rpc('set_message_like',{target_message:reaction.dataset.likeMessage,liked:reaction.getAttribute('aria-pressed')!=='true'}));delete reaction.dataset.busy;await refreshLikes(history);}catch(error){fail(error);}finally{delete reaction.dataset.busy;reaction.disabled=false;}return;}const shared=e.target.closest('[data-shared-content]');if(shared&&openShared)openShared(shared.dataset.sharedContent).catch(fail);};
  history.querySelectorAll('[data-like-message]').forEach(b=>b.disabled=t.state!=='accepted');
  await refreshLikes(history);await markRead(id,ordered);
  const currentEpoch=epoch;let latest=ordered.map(m=>m.id).join(',');
  const poll=async()=>{if(currentEpoch!==epoch||active!==id||!node.isConnected)return;try{const updated=await result(db.from('direct_threads').select('*').eq('id',id));if(currentEpoch!==epoch||active!==id||!node.isConnected)return;if(!updated.length){active=null;await inbox();return;}if(updated[0].state!==t.state){t.state=updated[0].state;await chat(id);return;}const fresh=(await result(db.from('direct_messages').select('*').eq('thread_id',id).order('created_at',{ascending:false}).limit(100))).reverse();if(currentEpoch!==epoch||active!==id||!node.isConnected)return;const next=fresh.map(m=>m.id).join(',');if(next!==latest){paintHistory(history,fresh,avatarHtml);latest=next;history.querySelectorAll('[data-like-message]').forEach(b=>b.disabled=t.state!=='accepted');}await refreshLikes(history);await markRead(id,fresh);}catch(e){console.error(e);}if(currentEpoch===epoch&&active===id)timer=setTimeout(poll,5000);};
  timer=setTimeout(poll,5000);
 }
 function historyReplace(url){history.replaceState(null,'',url);}
 function ensureDialog(){let dialog=$('#new-message-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='new-message-dialog';dialog.className='ig-new-message';document.body.append(dialog);dialog.addEventListener('close',()=>{if(!document.querySelector('#modal')?.open&&!document.querySelector('#lightbox')?.open)document.documentElement.classList.remove('modal-open');});}return dialog;}
 function newMessage(){const dialog=ensureDialog();dialog.innerHTML=`<div class="share-heading"><h2>New message</h2><button type="button" id="close-new-message" aria-label="Close">×</button></div><label>To<input id="recipient-search" placeholder="Search" autocomplete="off"></label><div id="recipient-results"></div>`;dialog.showModal();document.documentElement.classList.add('modal-open');$('#close-new-message').onclick=()=>dialog.close();$('#recipient-search').focus();let searchTimer,searchEpoch=0;$('#recipient-search').oninput=()=>{clearTimeout(searchTimer);const query=$('#recipient-search').value.trim(),request=++searchEpoch;$('#recipient-results').innerHTML='';if(query.length<2)return;searchTimer=setTimeout(async()=>{try{const rows=await result(db.from('profiles').select('*').ilike('username','%'+query.replace(/[%_]/g,'')+'%').neq('id',uid()).limit(15));if(request!==searchEpoch||!dialog.open)return;$('#recipient-results').innerHTML=rows.map(p=>`<button type="button" class="message-person" data-recipient="${p.id}"><strong>${esc(p.display_name)}</strong> <span class="meta">@${esc(p.username)}</span></button>`).join('')||'<p class="small">No people found.</p>';dialog.querySelectorAll('[data-recipient]').forEach(b=>b.onclick=()=>composeRecipient(rows.find(p=>p.id===b.dataset.recipient),dialog));}catch(e){fail(e);}},300);};}
 function composeRecipient(person,dialog){dialog.innerHTML=`<div class="share-heading"><h2>New message</h2><button type="button" id="close-new-message" aria-label="Close">×</button></div><p class="small">To <strong>${esc(person.display_name)}</strong> · @${esc(person.username)}</p><p class="small">If they don’t follow you, your first message becomes a request.</p><form id="new-message-form"><label class="sr-only" for="new-message-body">Message</label><textarea id="new-message-body" maxlength="2000" required placeholder="Message…"></textarea><button class="primary">Send</button></form>`;$('#close-new-message').onclick=()=>dialog.close();enterToSend($('#new-message-body'),$('#new-message-form'));attachRichComposer($('#new-message-body'));$('#new-message-body').focus();$('#new-message-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button.primary');button.disabled=true;try{active=await result(db.rpc('send_direct_message',{target:person.id,message_body:composerBody($('#new-message-body'))}));tab=follows.has(person.id)?'following':'requests';dialog.close();await inbox();}catch(e){fail(e);}finally{if(button.isConnected)button.disabled=false;}};}
 async function composeTo(person){if(!requireProfile())return;if(!$('#message-chat'))await inbox();const dialog=ensureDialog();dialog.showModal();document.documentElement.classList.add('modal-open');composeRecipient(person,dialog);}
 matchMedia('(max-width:760px)').addEventListener('change',()=>{if($('#message-chat'))syncShell(!!active);});
 return {inbox,stop,badge,composeTo};
}
