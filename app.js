import {createExperience} from './experience.js?v=20261127c';
import {createInterests,postTypeBadge,postTypeKey,hashtags} from './interest.js';
import {createComposer} from './composer.js?v=20261127c';
import {linkify,attachMentionSearch} from './text-links.js';
import {createSearch} from './search.js';
import {createSharing} from './sharing.js';
import {attachFavorites} from './favorites-picker.js';
import {createBilling} from './billing.js';
import {createMessages} from './messages.js';
import {validateMedia,configureCaptureButtons,mediaBaseType} from './media-validation.js?v=20261127c';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { openStoryEditor } from './story-editor.js';
import { attachCatalog } from './catalog.js';
import { createCommunity } from './community.js';
import { createBetaTools } from './beta-tools.js';
import {createEnhancements} from './enhancements.js';
import {getDraft,saveDraft,deleteDraft,uploadWithProgress} from './drafts.js';
import { storyGroups, rememberStoryGroup, storyGroupOpened } from './story-order.js';
const db=createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null,me=null,view=initialView(),feed=[],busy=false,toastTimer,loadId=0,routeProfileId=null,routing=false,savedPage=0,savedPosts=[],exploreFilter='foryou';
const interests=createInterests({db,getUser:()=>user});
const revealed=new Set();
const postBodies=new Map();
let engagementReady=false;
const experience=createExperience({db,result,esc,getUser:()=>user});
const signed=experience.signed;
const searchUsers=query=>result(db.from('profiles').select('id,username,display_name').ilike('username',String(query||'').replace(/[\\%_]/g,'\\$&')+'%').limit(6));
const billing=createBilling({db,$,modal,esc,toast,getUser:()=>user,auth,refresh:load});
const community=createCommunity({getBilling:()=>billing,getBeta:()=>beta,db,$,esc,result,modal,close,toast,fail,guarded,requireProfile,getUser:()=>user,getMe:()=>me,getEnhancements:()=>enhancements,isEnhanced:()=>engagementReady,showProfile,card,bindCards,signed,avatar,recordView,isRevealed:id=>revealed.has(id),searchUsers,openFeed:(kind,series=null)=>{view=kind;selectedSeries=series;mainCatalog.reset();if(series)$('#series-filter').value=series.label;const path=sectionPath[kind]||'/';if(location.pathname!==path)history.pushState({view:kind},'',path);load();}});
const beta=createBetaTools({db,$,esc,result,modal,close,toast,guarded,fail,requireProfile,getUser:()=>user,moderation:(...args)=>community.moderation(...args),refresh:load});
const enhancements=createEnhancements({shareContent:id=>sharing.share(id),db,$,esc,result,modal,close,toast,fail,guarded,requireProfile,getUser:()=>user,getMe:()=>me,readMe,refresh:refreshCurrent,showProfile,openPost:id=>community.openPost(id),people:()=>community.people(),spoiler:p=>community.spoiler(p)});
if(new URLSearchParams(location.search).has('chat'))document.body.classList.add('chat-window');
const sharing=createSharing({db,result,esc,requireProfile,uid:()=>user?.id,fail,toast,openPost:id=>community.openPost(id),openStoryPost:async p=>{storyPosts=[...storyPosts.filter(s=>s.id!==p.id),p];storySequence=[p.id];await story(p.id);}});
const messages=createMessages({openShared:id=>sharing.open(id),separateWindow:!new URLSearchParams(location.search).has('chat'),db,$,esc,result,requireProfile,getUser:()=>user,avatar,showProfile,fail,getStories:async authors=>{if(!authors.length)return [];const rows=await result(db.from('posts').select('*,profiles!posts_author_fkey(*)').eq('kind','story').eq('status','approved').in('author',authors).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:true}));storyPosts=[...new Map([...storyPosts,...rows].map(p=>[p.id,p])).values()];return rows;},storySeen:author=>storyGroupOpened(storyPosts,author,storyHistory()),openStory:async id=>{const p=storyPosts.find(p=>p.id===id);storySequence=storyPosts.filter(s=>s.author===p.author&&Date.parse(s.expires_at)>Date.now()).map(s=>s.id);await story(id);}});
const siteSearch=createSearch({db,esc,showProfile,openPost:id=>community.openPost(id),messagePerson:person=>messages.composeTo(person),getUser:()=>user});
const names={messages:'Messages',feed:'For you',theory:'Theories',episodes:'Episode reviews',chapters:'Chapter reviews',profile:'Profile',explore:'Explore'};
const sectionPath={feed:'/',theory:'/theories',chapters:'/chapters',episodes:'/episodes',explore:'/explore',messages:'/chat',profile:'/'};
let storyFollowing=new Set();
let storyPosts=[],activeProfile=null,profilePage=0,profilePosts=[];
const PAGE_SIZE=24;
let selectedSeries=null,feedPage=0,feedHasMore=false;
const catalogMedium=()=>view==='episodes'?'anime':view==='chapters'?'manga':null;
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4500);}
function modal(html,storyMode=false){if(!storyMode){stopStoryPlayback();storyEpoch++;storySequence=[];}$('#modal').classList.remove('story-editor-modal','comments-modal','viewers-open','compose-modal');$('#modal').classList.toggle('story-modal',storyMode);$('#modal-body').innerHTML=storyMode?'<div class="story-card">'+html+'</div>':html;$('#modal').scrollTop=0;if(!$('#modal').open)$('#modal').showModal();}
let storyAnimation=0,storyEpoch=0,storySequence=[];
function stopStoryPlayback(){cancelAnimationFrame(storyAnimation);storyAnimation=0;}
function closeModalOnly(){routing=true;stopStoryPlayback();storyEpoch++;storySequence=[];if($('#modal')?.open)$('#modal').close();$('#modal')?.classList.remove('story-modal','viewers-open','comments-modal');routing=false;}
function close(){const entry=history.state;closeModalOnly();if(!entry?.overlay)return;if(entry.entry){history.replaceState({view:'feed'},'','/');view='feed';load().catch(fail);}else{routing=true;history.back();}}
function fail(e){console.error(e);toast(e.message||'Something went wrong. Please try again.');}
async function result(promise){const r=await promise;if(r.error)throw r.error;return r.data;}
function guarded(fn){return async e=>{e?.preventDefault();if(busy)return;busy=true;const buttons=$('#modal-body').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);try{await fn(e);}catch(e){fail(e);}finally{busy=false;buttons.forEach(b=>b.disabled=false);}};}
function requireProfile(){if(me?.account_suspended){toast('Your account is suspended. Contact the moderator from account settings.');return false;}if(!user){auth();return false;}if(!me){profileEditor();return false;}return billing.gate();}
async function readMe(){messages.badge().catch(console.error);if(!engagementReady){const ready=await db.rpc('engagement_ready');engagementReady=!ready.error&&ready.data===true;}me=user?await result(db.from('profiles').select('*').eq('id',user.id).maybeSingle()):null;$('#account').textContent=me?me.display_name:user?'Set up profile':'Sign in';$('.create-row p').textContent=user?'Share a post or add to your story.':'Browse freely. Sign in to join the conversation.';try{await community.refresh();if(engagementReady)await enhancements.loadPins();}catch(e){console.error(e);}paintRail().catch(console.error);}
async function avatar(p){const url=await signed(p?.avatar_path);return url?`<img class="avatar" alt="${esc(p.display_name)} profile picture" src="${esc(url)}">`:`<span class="avatar">${esc((p?.display_name||'?')[0].toUpperCase())}</span>`;}
function empty(title,body){return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(body)}</p></div>`;}
const authorStoryCache=new Map();
async function authorStories(author,fresh=false){
 if(!user||!author)return [];
 const key=user.id+':'+author,cached=authorStoryCache.get(key);
 if(!fresh&&cached&&Date.now()-cached.at<30000)return cached.rows.filter(p=>Date.parse(p.expires_at)>Date.now());
 const rows=await result(db.from('posts').select('*,profiles!posts_author_fkey(*)').eq('author',author).eq('kind','story').eq('status','approved').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:true}).order('id').limit(500));
 authorStoryCache.set(key,{at:Date.now(),rows});return rows;
}
async function storyAvatar(profile){
 const picture=await avatar(profile);let rows=[];
 try{rows=await authorStories(profile?.id);}catch{ /* Avatar remains usable if stories cannot be read. */ }
 if(!rows.length)return picture;
 const seen=storyGroupOpened(rows,profile.id,storyHistory());
 return `<button class="author-story-avatar ${seen?'seen-story':''}" data-author-story="${esc(profile.id)}" aria-label="Watch ${esc(profile.display_name)}’s story"><span class="story-ring">${picture}</span></button>`;
}
async function openAuthorStories(author){
 if(!requireProfile())return;
 const rows=await authorStories(author,true);
 if(!rows.length){toast('No active stories to view.');await refreshCurrent();return;}
 storyPosts=[...storyPosts.filter(p=>p.author!==author),...rows];
 storySequence=rows.map(p=>p.id);await story(storySequence[0]);
}
function bindStoryAvatars(root=document){root.querySelectorAll('[data-author-story]').forEach(b=>b.onclick=()=>openAuthorStories(b.dataset.authorStory).catch(fail));}
async function load(){siteSearch.sync(view);messages.stop();activeProfile=null;const request=++loadId;feedPage=0;feed=[];await billing.status();await billing.returned();if(billing.blocked()&&view!=='profile'){stopStoryPlayback();$('#story-strip').hidden=true;$('.create-row').hidden=true;$('.community-tools').hidden=true;$('#filters').hidden=true;$('#intro').hidden=true;$('#view-title').textContent='FictionCom';$('#content').innerHTML=billing.render();$('#feed-membership').onclick=()=>billing.open().catch(fail);return;}
 const discussion=['feed','theory','episodes','chapters'].includes(view);$('#story-strip').hidden=!discussion;$('.create-row').hidden=!discussion;$('.community-tools').hidden=!discussion;if($('#feed-tabs')){$('#feed-tabs').hidden=!['feed','theory','episodes','chapters'].includes(view);document.querySelectorAll('#feed-tabs [data-feed]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.feed===view)));}if(discussion)renderStoryStrip(request);$('#view-title').textContent=names[view]||'FictionCom';$('#intro').hidden=['profile','feed','messages','explore'].includes(view);$('#filters').hidden=!['theory','episodes','chapters'].includes(view);$('main').classList.toggle('home-feed',view==='feed');$('main').classList.toggle('explore-view',view==='explore');const navView=['theory','episodes','chapters'].includes(view)?'feed':view;document.body.dataset.screen=view;document.querySelectorAll('button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view!=='create'&&b.dataset.view===navView));paintRail().catch(()=>{});
 if(selectedSeries&&catalogMedium()&&selectedSeries.medium!==catalogMedium()){selectedSeries=null;mainCatalog.reset();}
 $('#series-page').hidden=!selectedSeries;$('#series-filter').placeholder=view==='episodes'?'Search anime…':view==='chapters'?'Search manga…':'Search anime or manga…';
 $('#content').innerHTML=empty('Loading…','Finding the latest conversations.');
 if(view==='messages'){await messages.inbox();return;}
 if(view==='profile'){const target=routeProfileId||(user?user.id:null);routeProfileId=null;if(!target){$('#content').innerHTML='<section class="empty"><h2>Make yourself at home</h2><p>Create your profile, choose your favorite anime and manga, and connect with other fans. Browse freely; an account is required to post, react, follow or chat.</p><div class="form-actions"><button id="guest-create-profile" class="primary">Create account</button><button id="guest-profile-signin">Sign in</button></div></section>';$('#guest-create-profile').onclick=()=>auth('signup');$('#guest-profile-signin').onclick=()=>auth();return;}if(target===user?.id&&!me){profileEditor();$('#content').innerHTML=empty('Make yourself at home','Set up your profile to join the conversation.');return;}await showProfile(target,request);return;}
 if(view==='explore'){await renderExplore(request);return;}
 await loadFeedPage(request,true);
}
async function loadFeedPage(request,reset=false){try{if(!reset&&$('#feed-skeleton'))$('#feed-skeleton').hidden=false;
 let q=db.from('posts').select('*,profiles!posts_author_fkey(*)').neq('kind','avatar');
 if(view==='feed')q=user||engagementReady?db.rpc('home_feed',{page_number:feedPage,limit_count:PAGE_SIZE}).select('*,profiles!posts_author_fkey(*)'):q.neq('kind','story').order('created_at',{ascending:false}).order('id').range(feedPage*PAGE_SIZE,(feedPage+1)*PAGE_SIZE-1);
 if(view==='theory')q=q.eq('kind','theory');else if(view==='episodes'||view==='chapters')q=q.eq('kind','reaction').eq('medium',catalogMedium());else q=q.neq('kind','story');
 if(view!=='feed'){if(user&&!selectedSeries&&!$('#series-filter').value.trim()&&$('#discussion-sort').value==='recommended')q=db.rpc('recommended_discussions',{tab:view,page_number:feedPage,limit_count:PAGE_SIZE}).select('*,profiles!posts_author_fkey(*)');const title=$('#series-filter').value.trim();if(selectedSeries)q=q.eq('series',selectedSeries.title).eq('medium',selectedSeries.medium);else if(title)q=q.ilike('series',title.replace(/[\%_]/g,'\$&'));
 const recommended=user&&!selectedSeries&&!title&&$('#discussion-sort').value==='recommended';const sort=$('#discussion-sort').value;if(!recommended){if(sort==='episode-asc'||sort==='episode-desc')q=q.order('episode',{ascending:sort==='episode-asc',nullsFirst:false}).order('created_at',{ascending:false});else q=q.order('created_at',{ascending:sort==='oldest'});q=q.order('id',{ascending:true}).range(feedPage*PAGE_SIZE,(feedPage+1)*PAGE_SIZE-1);}}
 const posts=await result(q);if(view==='feed'&&user){const follows=await result(db.from('follows').select('following').eq('follower',user.id).eq('accepted',true));const circle=new Set([user.id,...follows.map(f=>f.following)]);posts.forEach(p=>p.suggested=!circle.has(p.author));}if(request!==loadId)return;const hydrated=await experience.hydrate(posts);if(user)await Promise.all([...new Set(posts.map(p=>p.author).filter(Boolean))].map(author=>authorStories(author).catch(()=>[])));if(request!==loadId)return;const cards=await Promise.all(posts.map(p=>card(p,hydrated.get(p.id))));if(request!==loadId)return;
 if(reset)$('#content').innerHTML=`<div id="feed-posts"></div><div id="feed-skeleton" class="feed-skeleton" hidden><div></div><div></div></div><button id="more-discussions" class="quiet load-more">${view==='feed'?'Load more posts':'Load more discussions'}</button>`;
 feed.push(...posts);feedPage++;feedHasMore=posts.length===PAGE_SIZE;$('#feed-posts').insertAdjacentHTML('beforeend',cards.join(''));if(!feed.length){const blanks={theory:['No theories yet','Theories stay in this section, separate from chapter and episode reviews.'],chapters:['No chapter reviews yet','Chapter reviews stay here. A chapter number is required when you post one.'],episodes:['No episode reviews yet','Episode reviews stay here. An episode number is required when you post one.']};const pair=blanks[view]||['No posts yet',selectedSeries?'Be the first to post about '+selectedSeries.label+'.':'Photos and conversations you follow show up here.'];$('#feed-posts').innerHTML=empty(pair[0],pair[1]);}const more=$('#more-discussions');if($('#feed-skeleton'))$('#feed-skeleton').hidden=true;more.hidden=!feedHasMore;more.disabled=false;experience.watchMore(more,()=>{if($('#feed-skeleton'))$('#feed-skeleton').hidden=false;loadFeedPage(request);});more._pump?.();bindCards();
 }catch(e){if(request!==loadId)return;if($('#feed-skeleton'))$('#feed-skeleton').hidden=true;if(reset)$('#content').innerHTML=empty('Couldn’t load discussions','Please refresh to try again.');else{toast('Couldn’t load more. Please try again.');const more=$('#more-discussions');if(more)more.disabled=false;}console.error(e);}}
const igIcon={
 heart:'<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 20.2s-7.2-4.4-7.2-9.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.2 3.5c0 4.7-7.2 9.1-7.2 9.1Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
 comment:'<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M5 17.5 3.5 21l3.6-1.4A8.5 8.5 0 1 0 5 17.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
 share:'<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M21 4.5 3.8 11.2c-.9.4-.8 1.6.1 1.8l6.2 1.5 1.6 6.1c.3.9 1.5.9 1.8 0L21 4.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
 save:'<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M6 3.8h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.8a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'
};
function relTime(date){const sec=Math.max(0,(Date.now()-new Date(date).getTime())/1000);if(sec<45)return 'Just now';if(sec<3600)return Math.max(1,Math.floor(sec/60))+'m';if(sec<86400)return Math.floor(sec/3600)+'h';if(sec<604800)return Math.floor(sec/86400)+'d';if(sec<31536000)return Math.floor(sec/604800)+'w';return Math.floor(sec/31536000)+'y';}
async function card(p,pre){
 postBodies.set(p.id,p.body||'');
 const author=p.profiles;
 const ctx=pre||(await experience.hydrate([p])).get(p.id)||{stats:{},liked:false,saved:false,attachments:[],urls:{}};
 const stats=ctx.stats||{};
 const liked=!!ctx.liked;
 const saved=!!ctx.saved;
 const isHidden=community.spoiler(p)&&!revealed.has(p.id);
 const raw=!isHidden&&p.kind!=='story'?experience.renderMedia(p,ctx):'';
 const ratioClass={'1:1':'ratio-1-1','4:5':'ratio-4-5','16:9':'ratio-16-9',original:'ratio-original'}[p.media_ratio]||'ratio-4-5';const media=raw?'<div class="ig-media '+ratioClass+'">'+raw+'</div>':'';
 const seriesLabel=p.series?p.series+(p.kind==='reaction'&&p.episode?' · '+(p.medium==='manga'?'Chapter':'Episode')+' '+p.episode:''):'';
 const username=author?.username||author?.display_name||'member';
 const body=p.body||'';
 const short=body.length>125?body.slice(0,125).trimEnd()+'…':body;
 const subtitle=[seriesLabel,p.suggested?'Suggested for you':''].filter(Boolean).join(' · ');
 const menu=[
  engagementReady&&p.suggested?'<button type="button" data-dismiss="'+p.id+'">Not interested</button>':'',
  engagementReady&&p.author===user?.id&&p.status==='approved'&&!['story','avatar'].includes(p.kind)?'<button type="button" data-pin="'+p.id+'">'+(enhancements.isPinned(p.id)?'Unpin':'Pin')+'</button>':'',
  p.author===user?.id&&p.media_path&&p.status==='pending'?'<button type="button" data-ai-review="'+p.id+'">Finish upload</button>':'',
  p.author===user?.id&&!['story','avatar'].includes(p.kind)&&p.status==='approved'?'<button type="button" data-edit-post="'+p.id+'">Edit</button>':'',
  p.author===user?.id?'<button type="button" data-delete="'+p.id+'">Delete</button>':'',
  p.author===user?.id&&p.kind==='story'?'<button type="button" data-viewers="'+p.id+'">Viewers</button>':'',
  p.author!==user?.id?'<button type="button" data-report="'+p.id+'">Report</button>':''
 ].filter(Boolean).join('');
 const likes=stats.likes||0;
 const comments=stats.comments||0;
 return '<article class="post social-post" data-post="'+p.id+'" data-dwell="'+p.id+'" data-series="'+esc(p.series||'')+'" data-author="'+(p.author||'')+'" data-type="'+postTypeKey(p)+'" data-tags="'+esc(hashtags(p.body).join(' '))+'"><div class="post-head">'+await storyAvatar(author)+'<div class="ig-id"><button type="button" data-person="'+p.author+'"><strong>'+esc(username)+'</strong>'+postTypeBadge(p)+'</button>'+(subtitle?'<button type="button" class="text-button meta" data-series="'+esc(p.series||'')+'" data-medium="'+esc(p.medium||'')+'">'+esc(subtitle)+'</button>':'')+'</div><details class="ig-menu"><summary aria-label="More options">•••</summary><div class="ig-menu-pop">'+(menu||'<button type="button" disabled>No other actions</button>')+'</div></details></div>'+(p.status!=='approved'?'<p class="status">'+(p.status==='pending'?'Upload incomplete · only visible to you':'Upload removed · only visible to you')+'</p>':'')+(isHidden?'<div class="spoiler ig-spoiler"><strong>Spoilers ahead</strong><p>'+esc(seriesLabel||'This post')+'</p><button type="button" data-reveal="'+p.id+'">See post</button></div>':media)+(p.kind==='story'?'<div class="post-body"><button type="button" data-story="'+p.id+'" class="primary">Watch story</button><p class="small">Expires '+new Date(p.expires_at).toLocaleString()+'</p></div>':'')+'<div class="actions ig-actions"><div class="ig-actions-left"><button type="button" data-like="'+p.id+'" class="ig-action'+(liked?' liked':'')+'" aria-pressed="'+(liked?'true':'false')+'" aria-label="'+(liked?'Unlike':'Like')+' post">'+igIcon.heart+'</button><button type="button" data-comments="'+p.id+'" class="ig-action" aria-label="Comment">'+igIcon.comment+'</button><button type="button" data-share="'+p.id+'" class="ig-action" aria-label="Share post">'+igIcon.share+'</button></div><button type="button" data-save="'+p.id+'" class="ig-action'+(saved?' saved':'')+'" aria-pressed="'+(saved?'true':'false')+'" aria-label="'+(saved?'Unsave':'Save')+' post">'+igIcon.save+'</button></div><div class="ig-foot"><button type="button" class="ig-likes" data-like-total="'+p.id+'" '+(likes?'':'hidden')+'><strong>'+likes+' '+(likes===1?'like':'likes')+'</strong></button><div class="ig-caption"><button type="button" class="ig-author" data-person="'+p.author+'">'+esc(username)+'</button> <span class="post-copy" data-copy="'+p.id+'">'+linkify(short)+'</span>'+(body.length>125?' <button type="button" class="ig-more" data-expand="'+p.id+'" aria-expanded="false">more</button>':'')+'</div>'+(p.title?'<p class="small">'+esc(p.title)+'</p>':'')+'<button type="button" class="ig-comments-link" data-comments="'+p.id+'">'+(comments?'View all '+comments+' comments':'Add a comment')+'</button><time class="ig-time">'+relTime(p.created_at)+'</time></div></article>';
}
function onDoubleLike(id){const button=[...document.querySelectorAll(`[data-like="${id}"]`)].find(node=>!node.classList.contains('liked'));if(button)button.click();}
function bindCards(){experience.bindStages(document,{onDoubleLike});interests.watch(document);bindStoryAvatars();document.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>sharing.share(b.dataset.share).catch(fail));document.querySelectorAll('[data-pin]').forEach(b=>b.onclick=()=>enhancements.pin(b.dataset.pin).catch(fail));document.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=()=>enhancements.dismiss(b.dataset.dismiss).catch(fail));document.querySelectorAll('[data-expand]').forEach(b=>b.onclick=()=>{const expanded=b.getAttribute('aria-expanded')==='true',body=postBodies.get(b.dataset.expand)||'';b.closest('article').querySelector('[data-copy]').innerHTML=linkify(expanded?body.slice(0,320).trimEnd()+'…':body);b.setAttribute('aria-expanded',String(!expanded));b.textContent=expanded?'Show more':'Show less';});document.querySelectorAll('[data-edit-post]').forEach(b=>b.onclick=()=>editPost(b.dataset.editPost).catch(fail));document.querySelectorAll('[data-ai-review]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await reviewUpload(b.dataset.aiReview);await refreshCurrent();}catch(e){fail(e);}finally{b.disabled=false;}});document.querySelectorAll('[data-save]').forEach(b=>b.onclick=()=>community.save(b.dataset.save).catch(fail));document.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>{if(b.dataset.series)community.hub({title:b.dataset.series,medium:b.dataset.medium}).catch(fail);});document.querySelectorAll('.post-head').forEach(h=>{const person=h.querySelector('[data-person]'),av=h.querySelector('.avatar');if(person&&av&&!av.closest('[data-author-story]')){av.style.cursor='pointer';av.onclick=()=>showProfile(person.dataset.person);}});document.querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>showProfile(b.dataset.person));document.querySelectorAll('[data-like]').forEach(b=>b.onclick=async()=>{if(!requireProfile())return;b.disabled=true;try{const id=b.dataset.like;const liked=await result(db.from('likes').select('*').eq('post_id',id).eq('user_id',user.id).maybeSingle());await result(liked?db.from('likes').delete().eq('post_id',id).eq('user_id',user.id):db.from('likes').insert({post_id:id,user_id:user.id}));const stats=await result(db.rpc('post_stats',{target:id}));document.querySelectorAll('[data-like]').forEach(button=>{if(button.dataset.like!==id)return;const on=!liked;button.classList.toggle('liked',on);button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',(on?'Unlike':'Like')+' post');const total=document.querySelector('[data-like-total="'+id+'"]');if(total){const n=stats.likes||0;total.hidden=n===0;total.innerHTML='<strong>'+n+' '+(n===1?'like':'likes')+'</strong>';}if(!button.querySelector('svg'))button.textContent=(on?'♥':'♡')+' '+(stats.likes||0);});}catch(e){fail(e);}finally{b.disabled=false;}});
 document.querySelectorAll('[data-reveal]').forEach(b=>b.onclick=()=>{revealed.add(b.dataset.reveal);if($('#modal').open)community.openPost(b.dataset.reveal).catch(fail);else refreshCurrent();});document.querySelectorAll('[data-comments]').forEach(b=>b.onclick=()=>community.conversation(b.dataset.comments).catch(fail));document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deletePost(b.dataset.delete));document.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>report(b.dataset.report));document.querySelectorAll('[data-viewers]').forEach(b=>b.onclick=()=>viewers(b.dataset.viewers).catch(fail));document.querySelectorAll('[data-story]').forEach(b=>b.onclick=()=>story(b.dataset.story).catch(fail));document.querySelectorAll('[data-video]').forEach(v=>v.onplay=()=>recordView(v.dataset.video));if(me){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){const p=feed.find(p=>p.id===e.target.dataset.post);if(p&&p.media_type!=='video'&&(!community.spoiler(p)||revealed.has(p.id))){recordView(p.id);observer.unobserve(e.target);}}}),{threshold:0.5});document.querySelectorAll('article[data-post]').forEach(a=>observer.observe(a));}}
async function recordView(id){if(!me)return;const r=await db.from('post_views').insert({post_id:id,user_id:user.id});if(r.error&&r.error.code!=='23505')console.error(r.error);}
const storyHistoryCache=new Map();
function storyHistory(){const key=user?.id||'guest';if(storyHistoryCache.has(key))return storyHistoryCache.get(key);try{const fresh=localStorage.getItem('fictioncom-story-opened:'+key);const legacy=localStorage.getItem('animecom-story-opened:'+key);const value=JSON.parse(fresh||legacy||'{}');const history=value&&typeof value==='object'&&!Array.isArray(value)?value:{};storyHistoryCache.set(key,history);if(!fresh&&legacy)localStorage.setItem('fictioncom-story-opened:'+key,JSON.stringify(history));return history;}catch{return {};}}
async function paintStoryStrip(request=loadId){
 const strip=$('#story-strip');const signature=JSON.stringify([user?.id,me?.avatar_path,me?.display_name,storyPosts.map(p=>[p.id,p.author,p.profiles?.avatar_path,p.profiles?.display_name]),[...storyFollowing],storyHistory()]);if(strip.dataset.paintSignature===signature&&strip.children.length)return;if(!user){if(request!==loadId)return;strip.hidden=view==='profile';strip.dataset.paintSignature=signature;strip.innerHTML='<div class="own-story-bubble"><button class="story-bubble add-story" id="your-story" aria-label="Sign in to add your story"><span class="story-ring"><span class="avatar">◎</span></span><span>Your story</span></button><button class="story-plus" id="add-story" aria-label="Sign in to add a story">+</button></div>';$('#your-story').onclick=createStory;$('#add-story').onclick=createStory;return;}const history=storyHistory(),groups=storyGroups(storyPosts.filter(p=>p.author===user.id||storyFollowing.has(p.author)),user.id,history,storyFollowing),own=storyPosts.find(p=>p.author===user?.id),ownSeen=own&&storyGroupOpened(storyPosts,user.id,history);
 const ownHtml=`<div class="own-story-bubble"><button class="story-bubble ${own?(ownSeen?'seen-story':''):'add-story'}" id="your-story" ${own?`data-story="${own.id}"`:''} aria-label="${own?'Watch your story':'Add your story'}"><span class="story-ring">${me?await avatar(me):'<span class="avatar">◎</span>'}</span><span>Your story</span></button><button class="story-plus" id="add-story" aria-label="Add another story">+</button></div>`;
 const bubbles=await Promise.all(groups.map(async g=>`<button class="story-bubble ${g.opened?'seen-story':''}" data-story="${g.post.id}" aria-label="Watch ${esc(g.post.profiles.display_name)}’s story"><span class="story-ring">${await avatar(g.post.profiles)}</span><span>${esc(g.post.profiles.display_name)}</span></button>`));
 if(request!==loadId)return;strip.dataset.paintSignature=signature;strip.innerHTML=ownHtml+bubbles.join('');
 $('#add-story').onclick=createStory;if(!own)$('#your-story').onclick=createStory;
 strip.querySelectorAll('[data-story]').forEach(b=>b.onclick=()=>story(b.dataset.story).catch(fail));
}
function markStoryOpened(p){document.querySelectorAll('[data-author-story]').forEach(b=>{if(b.dataset.authorStory===p.author)b.classList.add('seen-story');});const history=rememberStoryGroup(storyPosts,p.author,storyHistory());storyHistoryCache.set(user?.id||'guest',history);try{localStorage.setItem('fictioncom-story-opened:'+(user?.id||'guest'),JSON.stringify(history));}catch{}paintStoryStrip().catch(console.error);}
async function renderStoryStrip(request=loadId){
 const owner=user?.id;if(!owner){storyPosts=[];storyFollowing=new Set();await paintStoryStrip(request);return;}
 try{const following=new Set((await result(db.from('follows').select('following').eq('follower',owner).eq('accepted',true))).map(f=>f.following));const posts=await result(db.from('posts').select('*,profiles!posts_author_fkey(*)').eq('kind','story').gt('expires_at',new Date().toISOString()).in('author',[owner,...following]).order('created_at',{ascending:false}).limit(500));if(request!==loadId||user?.id!==owner)return;storyFollowing=following;storyPosts=posts.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));await paintStoryStrip(request);}
 catch{if(request!==loadId||user?.id!==owner)return;if(!$('#story-strip').children.length)await paintStoryStrip(request);}
}
async function refreshCurrent(){if(activeProfile)await showProfile(activeProfile);else await load();}
function createStory(){if(!requireProfile())return;openStoryEditor({modal,onPublish:async(file,metadata)=>{await uploadPost(file,{...metadata,author:user.id});close();toast('Your story is live.');view='feed';await load();}});}
function storyIcon(type){const paths={mute:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',sound:'<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',pause:'<path d="M8 5v14m8-14v14"/>',play:'<path d="m8 5 11 7-11 7V5Z"/>'};return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[type]}</svg>`;}
async function story(id){
 const epoch=++storyEpoch;stopStoryPlayback();
 if(!storySequence.length){const authors=[user?.id,...storyGroups(storyPosts,user?.id,storyHistory(),storyFollowing).map(g=>g.post.author)].filter(Boolean);storySequence=authors.flatMap(a=>storyPosts.filter(p=>p.author===a).map(p=>p.id));}
 const p=storyPosts.find(p=>p.id===id);if(!p)return;
 const siblings=storyPosts.filter(x=>x.author===p.author),index=siblings.findIndex(x=>x.id===id),own=p.author===user?.id;
 const sequenceIndex=storySequence.indexOf(id);
 const header=`<div class="story-owner"><button class="story-owner-profile" data-story-profile="${p.author}" aria-label="View ${esc(p.profiles.display_name)}’s profile">${await avatar(p.profiles)}</button><div><strong>${esc(p.profiles.display_name)}</strong><span class="meta">${relTime(p.created_at)}</span></div></div>`;
 if(epoch!==storyEpoch)return;
 if(community.spoiler(p)&&!revealed.has(id)){markStoryOpened(p);modal(header+`<div class="spoiler"><h2>Spoilers ahead</h2><p>${esc(p.series)} · ${p.medium==='manga'?'Chapter':'Episode'} ${p.episode||'?'}</p><button id="reveal-story">Watch story</button></div>`,true);$('#reveal-story').onclick=()=>{revealed.add(id);story(id).catch(fail);};return;}
 const url=await signed(p.media_path);if(epoch!==storyEpoch)return;if(!url)throw Error('This story is unavailable.');
 modal(`<div class="story-progress">${siblings.map((_,i)=>`<span class="${i<=index?'watched':''}"></span>`).join('')}</div>`+header+`<div id="story-stage" class="story-stage">${p.media_type==='video'?`<video autoplay muted playsinline src="${esc(url)}"></video>`:`<img src="${esc(url)}" alt="${esc(p.body||'Story photo')}">`}<button id="prev-story" class="story-nav story-nav-prev" aria-label="Previous story" ${sequenceIndex===0?'disabled':''}>‹</button><button id="next-story" class="story-nav story-nav-next" aria-label="Next story" ${sequenceIndex===storySequence.length-1?'disabled':''}>›</button>${'<button id="story-menu-toggle" class="story-menu-toggle" aria-label="Story options" aria-expanded="false">⋯</button><div id="story-menu" class="story-menu" hidden><button id="story-menu-action" class="danger">'+(own?'Delete story':'Report story')+'</button></div>'}</div>${own&&p.status!=='approved'?`<p class="status">${p.status==='pending'?'Upload incomplete · only visible to you':'Story removed · only visible to you'}</p>${p.status==='pending'?'<button id="retry-story-review">Finish upload</button>':''}`:''}<div class="story-top-controls"><button id="mute-story" aria-label="Unmute story">${storyIcon('mute')}</button><button id="pause-story" aria-label="Pause story">${storyIcon('pause')}</button></div>${own?'<button id="story-viewers" class="viewer-trigger" aria-expanded="false"><span class="viewer-chevron" aria-hidden="true">⌃</span><span>Viewers</span></button><section id="story-viewer-panel" class="story-viewer-sheet" hidden></section>':''}`,true);
 $('.story-card').insertAdjacentHTML('beforeend',`<section id="story-interactions" class="${own?'own-story-interactions':''}"></section>`);await enhancements.storyControls(p);
 $('#modal-body').querySelector('[data-story-profile]').onclick=()=>{close();showProfile(p.author);};const cardNode=$('.story-card');cardNode.append($('#prev-story'),$('#next-story'));const neighborIds=[storySequence[sequenceIndex-1],storySequence[sequenceIndex+1]];await Promise.all(neighborIds.map(async(neighborId,i)=>{const neighbor=storyPosts.find(s=>s.id===neighborId);if(!neighbor)return;const safe=!community.spoiler(neighbor)||revealed.has(neighbor.id),previewUrl=safe?await signed(neighbor.media_path):null;if(epoch!==storyEpoch||!cardNode.isConnected)return;const preview=document.createElement('button');preview.className='story-neighbor '+(i?'story-neighbor-next':'story-neighbor-prev');preview.setAttribute('aria-label',(i?'Next':'Previous')+' story by '+neighbor.profiles.display_name);preview.innerHTML=(previewUrl?(neighbor.media_type==='video'?`<video src="${esc(previewUrl)}" muted playsinline preload="metadata"></video>`:`<img src="${esc(previewUrl)}" alt="">`):'<span>Spoiler hidden</span>')+`<strong>${esc(neighbor.profiles.display_name)}</strong>`;preview.onclick=()=>story(neighborId).catch(fail);$('#modal-body').append(preview);}));if(epoch!==storyEpoch)return;
 markStoryOpened(p);
 if($('#retry-story-review'))$('#retry-story-review').onclick=guarded(async()=>{await reviewUpload(id);await renderStoryStrip();await story(id);});
 const next=()=>{if(sequenceIndex+1<storySequence.length)story(storySequence[sequenceIndex+1]).catch(fail);else close();};const previous=()=>{if(sequenceIndex>0)story(storySequence[sequenceIndex-1]).catch(fail);};
 $('#prev-story').onclick=previous;$('#next-story').onclick=next;
 {$('#story-menu-toggle').onclick=()=>{const menu=$('#story-menu');menu.hidden=!menu.hidden;$('#story-menu-toggle').setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)$('#story-stage video')?.pause();else if($('#pause-story').dataset.paused!=='true')$('#story-stage video')?.play().catch(()=>{});};}$('#story-menu-action').onclick=()=>{stopStoryPlayback();if(own)deletePost(id);else report(id);};
 const stage=$('#story-stage'),video=stage.querySelector('video');$('#mute-story').disabled=!video;$('#mute-story').onclick=()=>{if(!video)return;video.muted=!video.muted;$('#mute-story').innerHTML=storyIcon(video.muted?'mute':'sound');$('#mute-story').setAttribute('aria-label',video.muted?'Unmute story':'Mute story');};let paused=false,elapsed=0,last=performance.now();const pause=()=>{paused=!paused;$('#pause-story').dataset.paused=String(paused);$('#pause-story').innerHTML=storyIcon(paused?'play':'pause');$('#pause-story').setAttribute('aria-label',paused?'Resume story':'Pause story');if(video){if(paused)video.pause();else video.play().catch(()=>{});}};$('#pause-story').onclick=pause;let lastSwipe=0;let holdTimer=0,holding=false;const holdDown=e=>{if(e.target.closest('button,input,textarea,a,form'))return;holdTimer=setTimeout(()=>{holding=true;if($('#pause-story')?.dataset.paused!=='true')$('#pause-story').click();},220);};const holdUp=()=>{clearTimeout(holdTimer);if(holding){holding=false;if($('#pause-story')?.dataset.paused==='true')$('#pause-story').click();}};const holdCard=document.querySelector('.story-card');if(holdCard){holdCard.addEventListener('pointerdown',holdDown);holdCard.addEventListener('pointerup',holdUp);holdCard.addEventListener('pointerleave',holdUp);holdCard.addEventListener('pointercancel',holdUp);}stage.tabIndex=0;stage.setAttribute('aria-label','Story media. Tap or press space to pause or resume.');stage.onkeydown=e=>{if(e.target!==stage)return;if(e.key===' '){e.preventDefault();$('#pause-story').click();}if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')previous();};
 if(video)video.onended=next;
 const tick=now=>{if(epoch!==storyEpoch||!$('#modal').open)return;const panelOpen=$('#story-viewer-panel')&&!$('#story-viewer-panel').hidden;if(!paused&&!document.hidden&&!panelOpen&&(!$('#story-menu')||$('#story-menu').hidden)&&!video&&!document.activeElement?.closest('#story-reply-form'))elapsed+=Math.min(now-last,200);last=now;const fraction=video?(video.duration?video.currentTime/video.duration:0):Math.min(elapsed/5000,1);const bar=$('.story-progress').children[index];bar.style.background=`linear-gradient(to right,#fff ${fraction*100}%,#ffffff55 ${fraction*100}%)`;if(!video&&elapsed>=5000){next();return;}storyAnimation=requestAnimationFrame(tick);};storyAnimation=requestAnimationFrame(tick);
 let swipeStart=null;stage.addEventListener('touchstart',e=>{swipeStart={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});stage.addEventListener('touchend',e=>{if(!swipeStart)return;const dx=e.changedTouches[0].clientX-swipeStart.x,dy=e.changedTouches[0].clientY-swipeStart.y;if(Math.abs(dx)>70||Math.abs(dy)>60)lastSwipe=Date.now();if(Math.abs(dx)>70&&Math.abs(dy)<60){if(dx<0)next();else previous();}swipeStart=null;},{passive:true});
 if(own){let start=null;const stage=$('#story-stage');stage.addEventListener('touchstart',e=>{const t=e.touches[0];start={x:t.clientX,y:t.clientY};},{passive:true});stage.addEventListener('touchend',e=>{const t=e.changedTouches[0];if(start&&start.y-t.clientY>60&&Math.abs(start.x-t.clientX)<80)viewers(id,true).catch(fail);start=null;},{passive:true});$('#story-viewers').onclick=()=>{if(!$('#story-viewer-panel').hidden)collapseStoryViewers();else viewers(id,true).catch(fail);};}
 await recordView(id);
}
function collapseStoryViewers(){const panel=$('#story-viewer-panel');if(!panel)return;panel.hidden=true;$('#modal').classList.remove('viewers-open');const trigger=$('#story-viewers');trigger.setAttribute('aria-expanded','false');trigger.innerHTML='<span class="viewer-chevron" aria-hidden="true">⌃</span><span>Viewers</span>';if($('#pause-story')?.dataset.paused!=='true'&&(!$('#story-menu')||$('#story-menu').hidden))$('#story-stage video')?.play().catch(()=>{});}
async function viewers(id,inline=false){
 const p=storyPosts.find(p=>p.id===id);if(!user||!p||p.author!==user.id)throw Error('Only the story owner can see its viewer list.');
 $('#story-stage video')?.pause();
 const rows=await result(db.from('post_views').select('user_id,profiles!post_views_user_id_fkey(*)').eq('post_id',id));
 if(rows.length){const active=await result(db.from('posts').select('*,profiles!posts_author_fkey(*)').eq('kind','story').in('author',rows.map(r=>r.user_id)).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:true}).limit(500));storyPosts=[...new Map([...storyPosts,...active].map(p=>[p.id,p])).values()];}
 const storyLikes=await result(db.from('likes').select('user_id').eq('post_id',id)),likedViewers=new Set(storyLikes.map(l=>l.user_id));
 const history=storyHistory();
 const people=await Promise.all(rows.map(async r=>{
  const person=r.profiles,active=storyPosts.find(s=>s.author===r.user_id),seen=active&&storyGroupOpened(storyPosts,r.user_id,history);
  const picture=await avatar(person);
  return `<li class="story-viewer-row">${active?`<button class="viewer-story ${seen?'seen-story':''}" data-viewer-story="${active.id}" aria-label="Watch ${esc(person?.display_name)}’s story"><span class="story-ring">${picture}</span></button>`:picture}<button class="viewer-profile" data-viewer-profile="${r.user_id}"><strong>${esc(person?.display_name)}</strong><span class="meta">@${esc(person?.username)}</span></button>${likedViewers.has(r.user_id)?'<span class="viewer-liked" aria-label="Liked your story">♥</span>':''}</li>`;
 }));
 const html=`<h2>${rows.length} ${rows.length===1?'viewer':'viewers'}</h2><p class="small">Unique signed-in viewers. Only you can see this list.</p><ul class="viewer-list">${people.join('')||'<li class="small">No views yet.</li>'}</ul>`;
 if(inline&&$('#story-viewer-panel')){$('#story-viewer-panel').innerHTML=html;$('#story-viewer-panel').hidden=false;$('#story-viewers').setAttribute('aria-expanded','true');$('#story-viewers').innerHTML='<span class="viewer-chevron" aria-hidden="true">⌄</span><span>Viewers</span>';$('#modal').classList.add('viewers-open');}else modal(html);

 $('#modal-body').querySelectorAll('[data-viewer-story]').forEach(b=>b.onclick=()=>story(b.dataset.viewerStory).catch(fail));
 $('#modal-body').querySelectorAll('[data-viewer-profile]').forEach(b=>b.onclick=()=>{close();showProfile(b.dataset.viewerProfile).catch(fail);});
}
function auth(mode='signin'){
 const signup=mode==='signup';modal(`<h2>${signup?'Create your FictionCom account':'Welcome back'}</h2><p class="small">${signup?'FictionCom is free to use. No card or subscription is required. Create your account and set up your profile. Read the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy notice</a> first.':'Sign in to post, react, and follow your favorite creators.'}</p><div class="auth-options"><button type="button" id="google" class="oauth-button google-sign-in"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.3 35.1 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.8-6.6 7.5l6.3 5.3C37.4 38.4 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg><span>Continue with Google</span></button></div><p class="divider">or</p><form id="auth-form">${signup?'<label>Username<input id="signup-username" autocomplete="username" pattern="[a-z0-9_]{3,24}" minlength="3" maxlength="24" required placeholder="e.g. moonlit_manga"></label><p class="small">Use 3–24 lowercase letters, numbers, or underscores.</p><label>First name<input id="first-name" autocomplete="given-name" maxlength="60" required></label><label>Last name<input id="last-name" autocomplete="family-name" maxlength="60" required></label><p class="small">Your first and last name are stored with your account. Choose your public display name when setting up your profile.</p>':''}<label>Email<input id="email" type="email" autocomplete="email" required></label><label>Password<input id="password" type="password" ${signup?'minlength="10"':''} autocomplete="${signup?'new-password':'current-password'}" required></label>${signup?'<label>Confirm password<input id="confirm-password" type="password" autocomplete="new-password" required></label><label class="check"><input id="accept-rules" type="checkbox" required> I am at least 14 years old and agree to the community rules, Terms and Privacy notice. No nudity, explicit content, harassment, or stolen work.</label>':''}<p id="auth-error" class="error" role="alert"></p><button class="primary auth-submit">${signup?'Create account':'Sign in'}</button><p class="small">${signup?'Already have an account?':'New to FictionCom?'} <button id="auth-switch" type="button" class="text-button">${signup?'Sign in':'Create account'}</button></p>${signup?'':'<button type="button" id="reset" class="quiet">Forgot password?</button>'}</form>`);
 const redirectTo=location.origin+'/';const oauthError=error=>{const raw=String(error?.message||'');if(/not enabled|unsupported provider|provider is not enabled|validation_failed/i.test(raw))return 'Google sign-in isn’t turned on for this site yet. You can still use email.';return raw||'Unable to start Google sign-in. Please try again.';};const startGoogle=async()=>{const box=$('#auth-error');if(box)box.textContent='';const button=$('#google');if(button)button.disabled=true;try{oauthStarted=true;await result(db.auth.signInWithOAuth({provider:'google',options:{redirectTo}}));}catch(error){oauthStarted=false;if(box)box.textContent=oauthError(error);else toast(oauthError(error));}finally{if(button?.isConnected)button.disabled=false;}};if($('#google'))$('#google').onclick=()=>startGoogle();oauthStarted=false;$('#close-modal').onclick=()=>{if(!oauthStarted)clearCreate();$('#close-modal').onclick=close;close();};$('#auth-switch').onclick=()=>auth(signup?'signin':'signup');
 $('#auth-form').onsubmit=guarded(async()=>{const email=$('#email').value.trim().toLowerCase(),password=$('#password').value;$('#auth-error').textContent='';try{if(signup){const username=$('#signup-username').value.trim().toLowerCase(),firstName=$('#first-name').value.trim(),lastName=$('#last-name').value.trim();if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error('Choose a username with 3–24 lowercase letters, numbers, or underscores.');if(!firstName||!lastName)throw Error('Enter your first and last name.');if(password!==$('#confirm-password').value)throw Error('Your passwords do not match.');const existing=await result(db.from('profiles').select('id').eq('username',username).limit(1));if(existing.length)throw Error('That username is already taken. Choose another username.');const data=await result(db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{age_14_or_older:true,username,first_name:firstName,last_name:lastName}}}));if(Array.isArray(data.user?.identities)&&data.user.identities.length===0)throw Error('This email is already linked to an account. Sign in instead, or use Forgot password to recover access.');if(data.session){close();toast('Account registered. Welcome to FictionCom.');}else{modal('<h2>Check your email</h2><p>Your registration request is received. Verify your email using the confirmation link, then sign in to set up your profile.</p><p>FictionCom is free. No card or subscription is required.</p><button id="back-signin" class="primary">Back to sign in</button>');$('#back-signin').onclick=()=>auth();}}else{await result(db.auth.signInWithPassword({email,password}));close();toast('Welcome back.');}}catch(e){$('#auth-error').textContent=signup&&(['user_already_exists','email_exists'].includes(e.code)||/already (?:registered|exists)/i.test(e.message||''))?'This email is already linked to an account. Sign in instead, or use Forgot password to recover access.':e.message||'Unable to sign in. Please try again.';}});
 if(!signup)$('#reset').onclick=()=>requestPasswordReset($('#email').value.trim());
}
function requestPasswordReset(initialEmail=''){
 modal(`<h2>Reset your password</h2><p>Confirm the email address linked to your account. We'll send a secure link to reset your password.</p><form id="reset-request"><label>Email address<input id="reset-email" type="email" autocomplete="email" value="${esc(initialEmail)}" required></label><label>Confirm email address<input id="reset-email-confirm" type="email" autocomplete="email" required></label><p id="reset-error" class="error" role="alert"></p><button class="primary">Send reset link</button><button id="reset-back" type="button" class="quiet">Back to sign in</button></form>`);
 $('#reset-back').onclick=()=>auth();
 $('#reset-request').onsubmit=guarded(async()=>{const email=$('#reset-email').value.trim().toLowerCase(),confirmation=$('#reset-email-confirm').value.trim().toLowerCase();$('#reset-error').textContent='';if(email!==confirmation){$('#reset-error').textContent='The email addresses do not match.';return;}try{await result(db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname}));modal('<h2>Check your email</h2><p>If an account exists for this email address, we’ll send a password reset link. Check your inbox and spam folder.</p><button id="reset-done" class="primary">Back to sign in</button>');$('#reset-done').onclick=()=>auth();}catch(e){$('#reset-error').textContent=e.message||'Unable to request a reset link. Please try again.';}});
}
function passwordReset(){modal('<h2>Choose a new password</h2><form id="new-password"><label>New password<input id="new-pass" type="password" minlength="10" autocomplete="new-password" required></label><label>Confirm new password<input id="new-pass-confirm" type="password" minlength="10" autocomplete="new-password" required aria-describedby="new-password-error"></label><p id="new-password-error" role="alert"></p><button class="primary">Save password</button></form>');$('#new-password').onsubmit=guarded(async()=>{const password=$('#new-pass').value;$('#new-password-error').textContent='';if(password!==$('#new-pass-confirm').value){$('#new-password-error').textContent='Your passwords do not match.';$('#new-pass-confirm').focus();return;}await result(db.auth.updateUser({password}));modal('<h2>Password reset successfully</h2><p>Your password has been updated. You can now sign in with your new password.</p><button id="password-reset-signin" class="primary">Back to sign in</button>');$('#password-reset-signin').onclick=guarded(async()=>{await result(db.auth.signOut());auth();});});}
async function registrationNext(){profileEditor();}
function profileEditor(){if(!user){auth();return;}const introducing=!me;modal(`<h2>${me?'Edit your profile':'Make your introduction'}</h2><form id="profile-form"><label>Username<input id="username" value="${esc(me?.username||user.user_metadata?.username)}" pattern="[a-z0-9_]{3,24}" minlength="3" maxlength="24" required placeholder="e.g. moonlit_manga"></label><label>Display name<input id="display-name" value="${esc(me?.display_name)}" maxlength="60" required></label><label>Bio<textarea id="bio" maxlength="500">${esc(me?.bio)}</textarea></label><label>Favorite anime & manga<input id="favorites" value="${esc(me?.favorites)}" maxlength="300" placeholder="The series you love"></label><label class="check"><input id="private" type="checkbox" ${me?.is_private?'checked':''}> Private account · approve followers</label>${!me?'<label class="check"><input type="checkbox" required> I am at least 14 and agree to the Terms, Privacy notice and community rules.</label>':''}<label>New profile picture<input id="profile-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="small">Photos and anime avatars are welcome. No nudity or inappropriate pictures. Maximum 10 MB.</p><label class="check"><input id="profile-ai-consent" type="checkbox"> If I upload a picture, I confirm it follows the no-nudity and community rules.</label><button class="primary">Save profile</button></form>`);const favoritesPicker=attachFavorites($('#favorites'),me?.favorite_series||[]);$('#profile-form').onsubmit=guarded(async()=>{const fields={username:$('#username').value.trim().toLowerCase(),display_name:$('#display-name').value.trim(),bio:$('#bio').value,favorites:favoritesPicker.value(),favorite_series:favoritesPicker.series(),is_private:$('#private').checked};try{if(me)await result(db.from('profiles').update(fields).eq('id',user.id));else await result(db.from('profiles').insert({id:user.id,...fields}));}catch(e){if(e.code==='23505')throw Error('That username is already taken. Choose another username.');throw e;}const file=$('#profile-file').files[0];if(file&&!$('#profile-ai-consent').checked)throw Error('Confirm the community rules before uploading a profile picture.');if(file)await uploadPost(file,{author:user.id,kind:'avatar',title:'Profile picture',body:'',series:'',medium:'anime',spoiler:false});await readMe();close();toast(file?'Profile saved. Picture uploaded.':'Profile saved.');view='profile';await load();await maybeResumeCreate();});}
async function showProfile(id,request){try{
 activeProfile=id;view='profile';siteSearch.sync('profile');$('#story-strip').hidden=true;$('.create-row').hidden=true;$('.community-tools').hidden=true;if($('#feed-tabs'))$('#feed-tabs').hidden=true;$('#filters').hidden=true;$('#intro').hidden=true;document.body.dataset.screen='profile';document.querySelectorAll('button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='profile'));profilePage=0;profilePosts=[];const profileRequest=request||++loadId;
 const p=await result(db.from('profiles').select('*').eq('id',id).single());
 const rows=await result(db.from('follows').select('*').or(`follower.eq.${id},following.eq.${id}`));
 const counts=await result(db.rpc('profile_counts',{target:id}));
 const relation=rows.find(f=>f.follower===user?.id&&f.following===id),own=id===user?.id;
 const countResponse=await db.from('posts').select('id',{count:'exact',head:true}).eq('author',id).neq('kind','avatar').neq('kind','story');if(countResponse.error)throw countResponse.error;
 const avatars=own?await result(db.from('posts').select('*').eq('author',id).eq('kind','avatar').order('created_at',{ascending:false}).limit(5)):[];
 if(profileRequest!==loadId)return;
 $('#view-title').textContent=own?'My profile':p.display_name;$('#filters').hidden=true;$('#intro').hidden=true;
 $('#content').innerHTML=`<section class="profile-top"><div class="profile-header"><div class="profile-avatar">${await storyAvatar(p)}</div><div class="profile-identity"><h2>${esc(p.display_name)}</h2><div class="meta">@${esc(p.username)}${p.is_private?' · Private account':''}</div><div class="profile-stats"><span><strong>${countResponse.count||0}</strong> posts</span><button id="profile-followers"><strong>${counts.followers||0}</strong> followers</button><button id="profile-following"><strong>${counts.following||0}</strong> following</button></div></div></div><p>${esc(p.bio)}</p><p class="small">${esc(p.favorites)}</p><div class="form-actions">${own?'<button id="edit-profile">Edit profile</button><button id="account-settings">Saved & settings</button><button id="signout">Sign out</button>':`<button id="follow" class="primary">${relation?(relation.accepted?'Unfollow':'Cancel request'):(p.is_private?'Request to follow':'Follow')}</button><button id="block">Block account</button>`}<button id="share-profile" type="button">Share</button></div></section>${own&&avatars.length?`<section class="rail-card"><h2>Profile pictures</h2>${avatars.map(a=>`<div class="person"><span>${esc(a.status)} · ${new Date(a.created_at).toLocaleDateString()}</span>${a.status==='pending'?`<button data-avatar-review="${a.id}">Finish upload</button>`:''}${a.status==='approved'?`<button data-use-avatar="${esc(a.media_path)}">Use picture</button>`:''}</div>`).join('')}</section>`:''}${own?'<div id="requests"></div>':''}<div class="type-filter" id="profile-type-filter" role="tablist" aria-label="Filter by type"><button type="button" data-profile-type="all" aria-selected="true">All</button><button type="button" data-profile-type="theory">Theories</button><button type="button" data-profile-type="chapters">Chapter reviews</button><button type="button" data-profile-type="episodes">Episode reviews</button></div><div class="profile-tabs" role="tablist" aria-label="Profile sections"><button type="button" data-profile-tab="posts" role="tab" aria-selected="true">Posts</button>${own?'<button type="button" data-profile-tab="saved" role="tab" aria-selected="false">Saved</button>':''}<button type="button" data-profile-tab="series" role="tab" aria-selected="false">Series</button></div><div id="profile-panel-posts"><div id="profile-grid" class="profile-grid"></div><div id="profile-skeleton" class="feed-skeleton" hidden><div></div><div></div><div></div></div><button id="more-posts" class="quiet load-more">Load more posts</button></div><div id="profile-panel-saved" hidden><div id="saved-grid" class="profile-grid"></div><div id="saved-skeleton" class="feed-skeleton" hidden><div></div><div></div><div></div></div><button id="more-saved-grid" class="quiet load-more">Load more saved</button></div><div id="profile-panel-series" hidden><div id="profile-shelves" data-owner="${id}"></div>${engagementReady?'':'<p class="small">Follow anime and manga to build your shelves.</p><button id="open-library" type="button">My anime & manga</button>'}</div>`;
 if(engagementReady)await enhancements.profile(id);bindProfileTabs(id,own);await loadProfilePage(id,profileRequest);
 bindStoryAvatars($('#content'));if(p.username&&!$('#modal').open&&!new URLSearchParams(location.search).has('chat')&&location.pathname!=='/u/'+p.username)history.pushState({view:'profile',id:p.id},'','/u/'+p.username);$('#share-profile').onclick=()=>sharing.shareLink({title:p.display_name+' on FictionCom',text:'@'+p.username+' on FictionCom',url:location.origin+'/u/'+p.username}).catch(fail);$('#profile-followers').onclick=()=>community.people(id,'Followers').catch(fail);$('#profile-following').onclick=()=>community.people(id,'Following').catch(fail);
 if(own){$('#account-settings').onclick=()=>community.settings().catch(fail);$('#edit-profile').onclick=profileEditor;$('#signout').onclick=()=>{modal('<h2>Sign out?</h2><p>Are you sure you want to log out?</p><div class="form-actions"><button id="cancel-signout" type="button">No</button><button id="confirm-signout" type="button" class="primary">Yes</button></div>');$('#cancel-signout').onclick=close;$('#confirm-signout').onclick=guarded(async()=>{const button=$('#confirm-signout');button.disabled=true;try{await result(db.auth.signOut());close();}catch(error){if(button.isConnected)button.disabled=false;throw error;}});$('#cancel-signout').focus();};document.querySelectorAll('[data-use-avatar]').forEach(b=>b.onclick=async()=>{try{await result(db.from('profiles').update({avatar_path:b.dataset.useAvatar}).eq('id',user.id));await readMe();await load();}catch(e){fail(e);}});document.querySelectorAll('[data-avatar-review]').forEach(b=>b.onclick=guarded(async()=>{await reviewUpload(b.dataset.avatarReview);await load();}));await requests(rows.filter(f=>f.following===id&&!f.accepted));}
 else{$('#follow').onclick=async()=>{if(!requireProfile())return;try{await result(relation?db.from('follows').delete().eq('follower',user.id).eq('following',id):db.from('follows').insert({follower:user.id,following:id}));await showProfile(id);}catch(e){fail(e);}};$('#block').onclick=()=>{if(!requireProfile())return;modal(`<h2>Block @${esc(p.username)}?</h2><p>You will no longer see each other’s posts while signed in.</p><button id="confirm-block" class="primary">Block account</button>`);$('#confirm-block').onclick=guarded(async()=>{await result(db.from('blocks').insert({blocker:user.id,blocked:id}));close();view='feed';await load();});};}
 }catch(e){fail(e);}}
async function loadProfilePage(id,request){const button=$('#more-posts');if(!button)return;button.disabled=true;if($('#profile-skeleton'))$('#profile-skeleton').hidden=false;try{
 const posts=await result(engagementReady?db.rpc('profile_feed',{target:id,page_number:profilePage}).select('*,profiles!posts_author_fkey(*)'):db.from('posts').select('*,profiles!posts_author_fkey(*)').eq('author',id).neq('kind','avatar').neq('kind','story').order('created_at',{ascending:false}).range(profilePage*PAGE_SIZE,(profilePage+1)*PAGE_SIZE-1));
 const hydrated=await experience.hydrate(posts);
 const tiles=posts.map(p=>{const pack=hydrated.get(p.id)||{},stats=pack.stats||{},url=!community.spoiler(p)?pack.urls?.[p.media_path]:null;return `<div class="profile-tile" data-type="${p.kind==='theory'?'theory':p.kind==='reaction'&&p.medium==='manga'?'chapters':p.kind==='reaction'?'episodes':'post'}">${engagementReady&&enhancements.isPinned(p.id,p.author)?'<span class="pinned-label">Pinned</span>':''}<button data-open-post="${p.id}" class="profile-thumbnail" aria-label="Open ${esc(p.title||p.series||'post')}">${postTypeBadge(p)}${community.spoiler(p)?'<span class="tile-text">Spoilers<br>Tap to reveal</span>':url?(p.media_type==='video'?`<video muted preload="metadata" src="${esc(url)}"></video><span class="tile-kind">▶</span>`:`<img loading="lazy" data-path="${esc(p.media_path||'')}" src="${esc(url)}" alt="${esc(p.title||p.series||'Post photo')}">`):`<span class="tile-text">${esc((p.title||p.body||'').slice(0,90))}</span>`}${p.status!=='approved'?`<span class="tile-status">${esc(p.status)}</span>`:''}</button><div class="tile-stats"><span>◉ ${stats.views||0} views</span><span>♡ ${stats.likes||0}</span></div></div>`;});
 if(request!==loadId||activeProfile!==id)return;profilePosts.push(...posts);profilePage++;$('#profile-grid').insertAdjacentHTML('beforeend',tiles.join(''));
 if(!profilePosts.length)$('#profile-grid').innerHTML=empty('No visible posts','Public posts appear here. Private posts require an approved follow request.');button.hidden=posts.length<PAGE_SIZE;experience.watchMore(button,()=>loadProfilePage(id,request).catch(fail));
 document.querySelectorAll('[data-open-post]').forEach(b=>b.onclick=()=>openProfilePost(b.dataset.openPost).catch(fail));
 }finally{if($('#profile-skeleton'))$('#profile-skeleton').hidden=true;if(button?.isConnected)button.disabled=false;button?._pump?.();}}
async function openProfilePost(id){const p=profilePosts.find(p=>p.id===id);if(!p)return;feed=profilePosts;modal(await card(p));bindCards();const reveal=$('#modal-body [data-reveal]');if(reveal)reveal.onclick=()=>{revealed.add(id);openProfilePost(id).catch(fail);};if(!community.spoiler(p)||revealed.has(id))await recordView(id);}

async function requests(rows){if(!rows.length)return;const people=await result(db.from('profiles').select('*').in('id',rows.map(r=>r.follower)));$('#requests').innerHTML=`<section class="rail-card"><h2>Follow requests</h2><div class="people">${people.map(p=>`<div class="person"><span>@${esc(p.username)}</span><button data-accept="${p.id}">Accept</button><button data-decline="${p.id}">Decline</button></div>`).join('')}</div></section>`;document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=async()=>{try{await result(db.from('follows').update({accepted:true}).eq('follower',b.dataset.accept).eq('following',user.id));await load();}catch(e){fail(e);}});document.querySelectorAll('[data-decline]').forEach(b=>b.onclick=async()=>{try{await result(db.from('follows').delete().eq('follower',b.dataset.decline).eq('following',user.id));await load();}catch(e){fail(e);}});}
const compose=createComposer({$,esc,toast,modal,close,guarded,requireProfile,createStory,getUser:()=>user,getView:()=>view,result,db,uploadMediaPost,searchUsers,onPublished:async target=>{const next=['theory','chapters','episodes','feed'].includes(target)?target:view;view=next;const path=sectionPath[next]||'/';if(location.pathname!==path)history.pushState({view:next},'',path);await load();}});
async function uploadPost(file,post){if(post.kind==='story')authorStoryCache.clear();await validateMedia(file,post.kind==='story'?60:300);const allowed=['image/jpeg','image/png','image/webp','video/mp4','video/webm'];if(!allowed.includes(file.type))throw Error('Choose a JPG, PNG, WebP, MP4, or WebM file.');if(file.size>10485760)throw Error('Keep uploads under 10 MB for this beta.');const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'}[file.type];const path=`${user.id}/${crypto.randomUUID()}.${ext}`;await uploadWithProgress({db,url:SUPABASE_URL,key:SUPABASE_KEY,path,file,onProgress:fraction=>toast('Uploading '+Math.round(fraction*100)+'%…')});let uploaded;try{uploaded=await result(db.from('posts').insert({...post,ai_review_consent:false,media_path:path,media_type:file.type.startsWith('image/')?'image':'video'}).select('id').single());await result(db.rpc('publish_upload',{target:uploaded.id}));}catch(e){if(uploaded)await db.from('posts').delete().eq('id',uploaded.id).eq('author',user.id);await db.storage.from('community-media').remove([path]);throw e;}}
function report(id){if(!requireProfile())return;modal('<h2>Report this post</h2><form id="report-form"><label>What’s wrong?<select id="reason"><option>Nudity or explicit content</option><option>Harassment or hate</option><option>Missing spoiler warning</option><option>Stolen content</option><option>Spam</option></select></label><button class="primary">Send report</button></form>');$('#report-form').onsubmit=guarded(async()=>{await result(db.from('reports').insert({reporter:user.id,post_id:id,reason:$('#reason').value}));close();toast('Report submitted for review.');});}
async function editPost(id){if(!requireProfile())return;const p=await result(db.from('posts').select('*').eq('id',id).eq('author',user.id).single());modal(`<h2>Edit post</h2><form id="edit-post-form"><label>Title<input id="edit-title" maxlength="120" value="${esc(p.title)}"></label><label>Post<textarea id="edit-body" maxlength="5000" required>${esc(p.body)}</textarea></label>${p.kind==='reaction'?`<label>${p.medium==='anime'?'Episode':'Chapter'}<input id="edit-episode" type="number" min="1" max="100000" value="${p.episode||''}" required></label>`:''}<label class="check"><input id="edit-spoiler" type="checkbox" ${p.spoiler?'checked':''}> Contains spoilers</label><button class="primary">Save changes</button></form>`);$('#edit-post-form').onsubmit=guarded(async()=>{await result(db.rpc('edit_post',{target:id,new_title:$('#edit-title').value,new_body:$('#edit-body').value,new_spoiler:$('#edit-spoiler').checked,new_episode:Number($('#edit-episode')?.value)||null}));close();toast('Post updated.');await refreshCurrent();});}
function deletePost(id){modal('<h2>Delete this post?</h2><p>The post, comments, and likes will be removed.</p><button id="confirm-delete" class="primary">Delete post</button>');$('#confirm-delete').onclick=guarded(async()=>{const p=await result(db.from('posts').select('*').eq('id',id).eq('author',user.id).single());const attachments=await result(db.from('post_media').select('path').eq('post_id',id));await result(db.from('posts').delete().eq('id',id).eq('author',user.id));if(p.kind==='story')authorStoryCache.clear();if(p?.media_path)await db.storage.from('community-media').remove([p.media_path,...attachments.map(a=>a.path)]);close();toast('Post deleted.');await load();});}
function rules(){modal('<h2>A community worth coming back to.</h2><ul class="rules-list"><li>No exposed nipples or genitals, full nudity, explicit sexual activity, or sexual content involving minors or characters depicted as minors. This applies to real photos, anime art, avatars, videos, and stories.</li><li>Exaggerated proportions, cleavage, swimwear, and revealing outfits are allowed when intimate areas are covered and content is not sexually explicit.</li><li>No harassment, hate, threats, impersonation, or spam.</li><li>Share work you own or have permission to post. Credit artists.</li><li>Mark spoilers. Episode and chapter reactions should use the correct number.</li><li>Uploads publish immediately. The moderator reviews reports and can remove rule-breaking posts.</li></ul>');}
async function paintRail(){const box=$('#rail-switch');if(!box)return;try{if(!user||!me)box.innerHTML='<div class="rail-me"><span class="avatar">F</span><div><strong>FictionCom</strong><span class="meta">Your fandom, together</span></div><button type="button" id="rail-signin" class="text-button">Sign in</button></div>';else box.innerHTML='<div class="rail-me">'+await avatar(me)+'<div><strong>'+esc(me.username)+'</strong><span class="meta">'+esc(me.display_name||'')+'</span></div><button type="button" id="rail-switch-btn" class="text-button">Switch</button></div>';if($('#rail-signin'))$('#rail-signin').onclick=()=>auth();if($('#rail-switch-btn'))$('#rail-switch-btn').onclick=()=>go('profile');let rows=[];try{rows=user&&engagementReady?await result(db.rpc('creator_suggestions')):await result(db.from('profiles').select('id,username,display_name,avatar_path,is_private').eq('account_suspended',false).order('username').limit(8));}catch{rows=[];}if(me)rows=rows.filter(p=>p.id!==me.id);rows=rows.slice(0,5);const host=$('#rail-suggestions');if(!host)return;host.innerHTML=(await Promise.all(rows.map(async p=>'<div class="suggest-row"><button type="button" data-suggest="'+p.id+'">'+await avatar(p)+'<span><strong>'+esc(p.username||p.display_name)+'</strong><span class="meta">'+esc(p.display_name||'')+'</span></span></button><button type="button" class="suggest-follow" data-follow="'+p.id+'">Follow</button></div>'))).join('')||'<p class="small">Creators you may like will show up here.</p>';host.querySelectorAll('[data-suggest]').forEach(b=>b.onclick=()=>{routeProfileId=b.dataset.suggest;view='profile';load().catch(fail);});host.querySelectorAll('[data-follow]').forEach(b=>b.onclick=async()=>{if(!requireProfile())return;b.disabled=true;try{await result(db.from('follows').insert({follower:user.id,following:b.dataset.follow}));b.textContent='Following';}catch(e){b.disabled=false;fail(e);}});}catch(e){console.error(e);}}
const mainCatalog=attachCatalog($('#series-filter'),{getMedium:catalogMedium,onSelect:item=>{selectedSeries=item;load();},onClear:()=>{selectedSeries=null;$('#series-page').hidden=true;}});
$('#series-page').onclick=()=>{if(selectedSeries)community.hub(selectedSeries).catch(fail);};$('#discussion-sort').onchange=()=>load();$('#clear-series').onclick=()=>{selectedSeries=null;mainCatalog.reset();load();};
const CREATE_RESUME='fictioncom-resume-create';
let oauthStarted=false;
function armCreate(){try{sessionStorage.setItem(CREATE_RESUME,'1');}catch{}}
function clearCreate(){try{sessionStorage.removeItem(CREATE_RESUME);}catch{}}
function wantsCreate(){try{return sessionStorage.getItem(CREATE_RESUME)==='1';}catch{return false;}}
function openCreate(){
 if(me?.account_suspended){toast('Your account is suspended. Contact the moderator from account settings.');return;}
 if(!user){armCreate();auth();return;}
 if(!me){armCreate();profileEditor();return;}
 if(!billing.gate())return;
 clearCreate();
 compose();
}
async function maybeResumeCreate(){
 if(!wantsCreate()||!user||!me)return;
 if(!billing.gate()){clearCreate();return;}
 clearCreate();
 await compose();
}
document.querySelectorAll('button[data-view]').forEach(b=>b.onclick=()=>go(b.dataset.view));document.querySelectorAll('[data-create],#compose').forEach(b=>b.onclick=event=>{event.preventDefault();openCreate();});document.addEventListener('click',event=>{const button=event.target.closest?.('[data-create],#compose');if(!button)return;if(event.defaultPrevented)return;event.preventDefault();openCreate();});document.querySelectorAll('#feed-tabs [data-feed]').forEach(b=>b.onclick=()=>{if(b.dataset.feed===view&&location.pathname===(sectionPath[b.dataset.feed]||'/')&&!location.search)return;go(b.dataset.feed);});$('#account').onclick=()=>{if(user)go('profile');else auth();};$('#compose').onclick=event=>{event.preventDefault();openCreate();};$('#discover').onclick=()=> (engagementReady?enhancements.discover():community.people()).catch(fail);document.querySelectorAll('.notif-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();community.notifications().catch(fail);});$('#my-series').onclick=()=>community.library().catch(fail);$('#rules').onclick=rules;$('#public-support').onclick=()=>beta.support().catch(fail);$('#public-feedback').onclick=()=>beta.feedback().catch(fail);$('#refresh').onclick=load;$('#filters').onsubmit=e=>{e.preventDefault();load();};$('#close-modal').onclick=close;document.querySelector('.brand')?.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;event.preventDefault();go('feed');});
db.auth.onAuthStateChange((event,session)=>{const previousId=user?.id;user=session?.user??null;if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED'||(event==='SIGNED_IN'&&previousId===user?.id))return;if(event==='USER_UPDATED'){setTimeout(()=>readMe().catch(fail),0);return;}setTimeout(async()=>{try{await readMe();if(event==='PASSWORD_RECOVERY'){passwordReset();return;}await load();if(event==='SIGNED_IN'&&!me)await registrationNext();else if(event==='SIGNED_IN')await maybeResumeCreate();}catch(e){fail(e);}},0);});
initTheme();
try{const data=await result(db.auth.getSession());user=data.session?.user??null;await readMe();await handleRoute();if(user&&!me)await registrationNext();else await maybeResumeCreate();}catch(e){fail(e);}

async function capturePoster(file){
 if(!String(file.type||'').startsWith('video/'))return null;
 const url=URL.createObjectURL(file),video=document.createElement('video');
 video.muted=true;video.playsInline=true;video.preload='auto';
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),8000);video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(Error('unreadable'));};video.src=url;});
  const width=video.videoWidth,height=video.videoHeight;if(!width||!height)return null;
  const scale=Math.min(1,960/Math.max(width,height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
  return blob&&blob.size?new File([blob],'poster.jpg',{type:'image/jpeg'}):null;
 }catch{return null;}
 finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}
function missingMediaColumns(error){return /media_ratio|media_posters|PGRST204|42703|schema cache/i.test(String(error?.message||'')+' '+String(error?.details||'')+' '+String(error?.code||''));}
async function insertPost(row,posterPaths){
 try{return await result(db.from('posts').insert(row).select('id').single());}
 catch(error){
  if(!missingMediaColumns(error))throw error;
  if(posterPaths.length)await db.storage.from('community-media').remove(posterPaths).catch(()=>{});
  const {media_ratio,media_posters,...rest}=row;
  return await result(db.from('posts').insert(rest).select('id').single());
 }
}
async function uploadMediaPost(files,post,onProgress=()=>{}){
 for(const file of files)await validateMedia(file,300);
 if(['story','avatar'].includes(post.kind)&&files.length>1)throw Error('Stories and profile pictures use one attachment.');if(files.length>6)throw Error('Choose up to 6 attachments.');
 const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
 for(const file of files){const kind=mediaBaseType(file.type);if(!types[kind]||file.size>10485760)throw Error('Each attachment must be JPG, PNG, WebP, MP4, or WebM and under 10 MB.');}
 const paths=[],attempted=[],posters={};let inserted=null,uploadedBytes=0;const totalBytes=files.reduce((sum,file)=>sum+file.size,0)||1;
 try{
  for(let i=0;i<files.length;i++){
   const file=files[i],kind=mediaBaseType(file.type),path=user.id+'/'+crypto.randomUUID()+'.'+types[kind];
   toast('Uploading attachment '+(i+1)+' of '+files.length+'…');
   attempted.push(path);
   await uploadWithProgress({db,url:SUPABASE_URL,key:SUPABASE_KEY,path,file,onProgress:fraction=>onProgress((uploadedBytes+fraction*file.size)/totalBytes)});
   uploadedBytes+=file.size;
   const media_type=kind.startsWith('image/')?'image':'video';
   paths.push({path,media_type});
   if(media_type==='video'){
    const poster=await capturePoster(file);
    if(poster){const posterPath=path+'.poster.jpg';try{await uploadWithProgress({db,url:SUPABASE_URL,key:SUPABASE_KEY,path:posterPath,file:poster,onProgress:()=>{}});attempted.push(posterPath);posters[path]=posterPath;}catch{/* The video still plays from its first frame. */}}
   }
  }
  const posterPaths=Object.values(posters);
  inserted=await insertPost({...post,ai_review_consent:false,media_path:paths[0].path,media_type:paths[0].media_type,...(posterPaths.length?{media_posters:posters}:{})},posterPaths);
  if(paths.length>1)await result(db.from('post_media').insert(paths.slice(1).map((item,index)=>({...item,post_id:inserted.id,position:index+1}))));
  await result(db.rpc('publish_upload',{target:inserted.id}));
 }catch(error){if(inserted)await db.from('posts').delete().eq('id',inserted.id).eq('author',user.id);if(attempted.length)await db.storage.from('community-media').remove(attempted);throw error;}
}


setInterval(()=>{if(!document.hidden){if(user){community.badge().catch(console.error);readMe().catch(console.error);}if(!activeProfile&&!['messages','profile','explore'].includes(view)&&!$('#modal').open)renderStoryStrip().catch(console.error);}},60000);
$('#modal').addEventListener('close',()=>{stopStoryPlayback();storyEpoch++;storySequence=[];});

async function reviewUpload(id){await result(db.rpc('publish_upload',{target:id}));toast('Upload published.');}

function safeDecode(value){try{return decodeURIComponent(value);}catch{return value;}}
function readPath(){
 const path=location.pathname.replace(/\/+$/,'')||'/';
 const post=path.match(/^\/p\/([0-9a-f-]{36})$/i);
 if(post)return {kind:'post',id:post[1]};
 const person=path.match(/^\/u\/([a-z0-9_]{3,24})$/i);
 if(person)return {kind:'user',username:person[1].toLowerCase()};
 const series=path.match(/^\/series\/([^/]+)$/);
 if(series)return {kind:'series',title:safeDecode(series[1]),medium:new URLSearchParams(location.search).get('medium')==='manga'?'manga':'anime'};
 if(path==='/explore')return {kind:'explore'};
 if(path==='/theories')return {kind:'theory'};
 if(path==='/chapters')return {kind:'chapters'};
 if(path==='/episodes')return {kind:'episodes'};
 if(path==='/chat')return {kind:'chat'};
 return {kind:'feed'};
}
function initialView(){
 if(new URLSearchParams(location.search).has('chat'))return 'messages';
 const route=readPath();
 if(route.kind==='explore')return 'explore';
 if(route.kind==='theory'||route.kind==='chapters'||route.kind==='episodes')return route.kind;
 if(route.kind==='chat')return 'messages';
 if(route.kind==='user')return 'profile';
 return 'feed';
}
function go(next){
 if(next==='create'){openCreate();return;}
 mainCatalog.close();
 if(next!==view){selectedSeries=null;mainCatalog.reset();}
 view=next;
 if(!new URLSearchParams(location.search).has('chat')){
  const path=next==='profile'&&me?.username?'/u/'+me.username:(sectionPath[next]||'/');
  if(location.pathname!==path||location.search)history.pushState({view:next},'',path);
 }
 load().catch(fail);
}
async function handleRoute(){
 if(new URLSearchParams(location.search).has('chat')){view='messages';await load();return;}
 const route=readPath();
 if(route.kind==='explore'){if(view==='explore'&&$('#explore-grid'))return;view='explore';await load();return;}
 if(route.kind==='theory'||route.kind==='chapters'||route.kind==='episodes'){view=route.kind;await load();return;}
 if(route.kind==='chat'){view='messages';await load();return;}
 if(route.kind==='user'){
  const row=await result(db.from('profiles').select('id').eq('username',route.username).maybeSingle());
  if(!row){toast('That profile is not available.');view='feed';history.replaceState({view:'feed'},'','/');await load();return;}
  routeProfileId=row.id;view='profile';await load();return;
 }
 if(route.kind==='post'){
  view='feed';await load();
  await community.openPost(route.id).catch(fail);
  if(history.state?.overlay!==true)history.replaceState({overlay:true,entry:true,id:route.id},'',location.pathname+location.search);
  return;
 }
 if(route.kind==='series'){
  view=route.medium==='manga'?'chapters':'episodes';
  selectedSeries={title:route.title,medium:route.medium,label:`${route.title} (${route.medium==='anime'?'Anime':'Manga'})`};
  await load();
  await community.hub(selectedSeries).catch(fail);
  if(history.state?.overlay!==true)history.replaceState({overlay:true,entry:true},'',location.pathname+location.search);
  return;
 }
 if(['feed','theory','episodes','chapters'].includes(view)&&$('#feed-posts'))return;
 view='feed';await load();
}
function bindProfileTabs(id,own){
 savedPage=0;savedPosts=[];
 const select=name=>{
  document.querySelectorAll('[data-profile-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.profileTab===name)));
  $('#profile-panel-posts').hidden=name!=='posts';
  const saved=$('#profile-panel-saved');if(saved)saved.hidden=name!=='saved';
  $('#profile-panel-series').hidden=name!=='series';
  if(name==='saved'&&own&&$('#saved-grid')&&!$('#saved-grid').dataset.loaded){$('#saved-grid').dataset.loaded='1';loadSavedGrid(loadId).catch(fail);}
 };
 document.querySelectorAll('[data-profile-tab]').forEach(button=>button.onclick=()=>select(button.dataset.profileTab));
 document.querySelectorAll('[data-profile-type]').forEach(button=>button.onclick=()=>{const type=button.dataset.profileType;document.querySelectorAll('[data-profile-type]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));document.querySelectorAll('#profile-grid .profile-tile,#saved-grid .profile-tile').forEach(tile=>{tile.hidden=type!=='all'&&tile.dataset.type!==type;});});
 if($('#open-library'))$('#open-library').onclick=()=>community.library().catch(fail);
}
function profileTile(post,pack){
 const stats=pack?.stats||{},url=!community.spoiler(post)?pack?.urls?.[post.media_path]:null;
 return `<div class="profile-tile" data-type="${post.kind==='theory'?'theory':post.kind==='reaction'&&post.medium==='manga'?'chapters':post.kind==='reaction'?'episodes':'post'}"><button type="button" class="profile-thumbnail" data-saved-post="${post.id}" aria-label="Open ${esc(post.title||post.series||'saved post')}">${postTypeBadge(post)}${community.spoiler(post)?'<span class="tile-text">Spoilers<br>Tap to reveal</span>':url?(post.media_type==='video'?`<video muted preload="metadata" src="${esc(url)}"></video><span class="tile-kind">▶</span>`:`<img loading="lazy" src="${esc(url)}" alt="${esc(post.title||post.series||'Saved photo')}">`):`<span class="tile-text">${esc((post.title||post.body||'').slice(0,90))}</span>`}</button><div class="tile-stats"><span>♡ ${stats.likes||0}</span></div></div>`;
}
async function loadSavedGrid(request){
 const button=$('#more-saved-grid');
 if(!button||!user)return;
 button.disabled=true;if($('#saved-skeleton'))$('#saved-skeleton').hidden=false;
 try{
  let rows;
  try{rows=await result(db.from('saved_posts').select('post_id,created_at,posts(*,profiles!posts_author_fkey(*))').eq('user_id',user.id).order('created_at',{ascending:false}).range(savedPage*PAGE_SIZE,(savedPage+1)*PAGE_SIZE-1));}
  catch{rows=await result(db.from('saved_posts').select('post_id,created_at,posts(*)').eq('user_id',user.id).order('created_at',{ascending:false}).range(savedPage*PAGE_SIZE,(savedPage+1)*PAGE_SIZE-1));}
  const posts=rows.map(row=>row.posts).filter(post=>post&&post.kind!=='avatar');
  const hydrated=await experience.hydrate(posts);
  if(request!==loadId||activeProfile!==user.id)return;
  savedPosts.push(...posts);savedPage++;
  $('#saved-grid').insertAdjacentHTML('beforeend',posts.map(post=>profileTile(post,hydrated.get(post.id))).join(''));
  if(!savedPosts.length)$('#saved-grid').innerHTML=empty('Nothing saved yet','Tap Save on a post and it will show up here.');
  button.hidden=rows.length<PAGE_SIZE;
  experience.watchMore(button,()=>loadSavedGrid(request).catch(fail));
  $('#saved-grid').querySelectorAll('[data-saved-post]').forEach(node=>node.onclick=()=>community.openPost(node.dataset.savedPost).catch(fail));
 }catch(error){console.error(error);if($('#saved-grid')&&!$('#saved-grid').children.length)$('#saved-grid').innerHTML=empty('Saved posts are unavailable','They will appear here once saving is available on your account.');}
 finally{if($('#saved-skeleton'))$('#saved-skeleton').hidden=true;if(button.isConnected)button.disabled=false;button._pump?.();}
}
async function renderExplore(request){
 const preset=(new URLSearchParams(location.search).get('tag')||'').replace(/^#/,'');
 $('#content').innerHTML=`<section class="explore"><div class="explore-type-tabs" role="tablist" aria-label="Explore sections"><button type="button" data-explore-type="foryou" aria-selected="${exploreFilter==='foryou'}">For you</button><button type="button" data-explore-type="theory" aria-selected="${exploreFilter==='theory'}">Theories</button><button type="button" data-explore-type="chapters" aria-selected="${exploreFilter==='chapters'}">Chapter reviews</button><button type="button" data-explore-type="episodes" aria-selected="${exploreFilter==='episodes'}">Episode reviews</button></div><form id="explore-search" class="explore-search" role="search"><label class="sr-only" for="explore-query">Search FictionCom</label><input id="explore-query" type="search" maxlength="80" placeholder="Search series, captions, #tags" value="${esc(preset?'#'+preset:'')}" autocomplete="off"></form><div id="explore-chips" class="chip-row" aria-label="Trending series"></div><h2 class="explore-heading">Find people</h2><div id="explore-people" class="people-row"></div><h2 class="explore-heading">Discover</h2><div id="explore-grid" class="explore-grid" aria-live="polite"></div></section>`;
 document.querySelectorAll('[data-explore-type]').forEach(button=>button.onclick=()=>{exploreFilter=button.dataset.exploreType;document.querySelectorAll('[data-explore-type]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));paintExplore(input.value.trim(),request).catch(fail);});
 const input=$('#explore-query');
 let timer=0;const run=()=>paintExplore(input.value.trim(),request).catch(fail);
 input.oninput=()=>{clearTimeout(timer);timer=setTimeout(run,280);};
 $('#explore-search').onsubmit=event=>{event.preventDefault();run();};
 await run();
}
async function loadAffinity(){const follows={authors:new Set(),series:new Set(),tags:new Set()};if(!user)return follows;try{const [people,series]=await Promise.all([result(db.from('follows').select('following').eq('follower',user.id).eq('accepted',true)),result(db.from('series_follows').select('series').eq('user_id',user.id))]);(people||[]).forEach(row=>follows.authors.add(row.following));(series||[]).forEach(row=>follows.series.add(row.series));}catch{}return follows;}
function bindExplorePreviews(root){experience.bindInlineVideos(root);}
async function paintExplore(query,request){
 const term=query.replace(/^#/,'').trim();
 const like=term.replace(/[\\%_]/g,'\\$&');
 const follows=await loadAffinity();
 const personalized=exploreFilter==='foryou'&&interests.hasSignals(follows);
 let exploreColumns=true;
 const exploreSelect=()=>exploreColumns?'id,title,body,series,medium,kind,episode,media_path,media_type,media_ratio,media_posters,spoiler,author,created_at,profiles!posts_author_fkey(username,display_name,avatar_path)':'id,title,body,series,medium,kind,episode,media_path,media_type,spoiler,author,created_at,profiles!posts_author_fkey(username,display_name,avatar_path)';
 const base=()=>{let built=db.from('posts').select(exploreSelect()).eq('status','approved').not('kind','in','(avatar,story)');if(exploreFilter==='theory')built=built.eq('kind','theory');else if(exploreFilter==='chapters')built=built.eq('kind','reaction').eq('medium','manga');else if(exploreFilter==='episodes')built=built.eq('kind','reaction').eq('medium','anime');else if(!personalized)built=built.not('media_path','is',null);return built;};
 const exploreRows=async build=>{try{return await result(build());}catch(error){if(!exploreColumns||!missingMediaColumns(error))throw error;exploreColumns=false;return await result(build());}};
 let groups;
 if(term.length>=2){
  const fields=query.trim().startsWith('#')?['body']:['series','body','title'];
  groups=await Promise.all(fields.map(field=>exploreRows(()=>base().ilike(field,'%'+like+'%').order('created_at',{ascending:false}).limit(24))));
 }else groups=[await exploreRows(()=>base().order('created_at',{ascending:false}).limit(36))];
 if(request!==loadId)return;
 const posts=[...new Map(groups.flat().filter(Boolean).map(post=>[post.id,post])).values()].slice(0,48);if(exploreFilter==='foryou'&&personalized)posts.sort((a,b)=>interests.score(b,follows)-interests.score(a,follows));posts.splice(36);
 const trendRows=term.length>=2?posts:await result(db.from('posts').select('series,medium').eq('status','approved').not('series','is',null).neq('series','').not('kind','in','(avatar,story)').order('created_at',{ascending:false}).limit(80));
 if(request!==loadId)return;
 const counts=new Map();
 for(const row of trendRows){if(!row.series)continue;const key=row.medium+'\0'+row.series;counts.set(key,(counts.get(key)||0)+1);}
 const chips=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12);
 $('#explore-chips').innerHTML=chips.map(([key,count])=>{const split=key.split('\0');return `<button type="button" class="series-chip" data-chip-title="${esc(split[1])}" data-chip-medium="${esc(split[0])}">${esc(split[1])} <span>${count}</span></button>`;}).join('')||'<p class="small">Series tags show up as people post.</p>';
 $('#explore-chips').querySelectorAll('[data-chip-title]').forEach(button=>button.onclick=()=>community.hub({title:button.dataset.chipTitle,medium:button.dataset.chipMedium,label:button.dataset.chipTitle}).catch(fail));
 let people=[];
 if(user&&engagementReady){try{people=await result(db.rpc('creator_suggestions'));}catch{people=[];}}
 if(!people.length){try{people=await result(db.from('profiles').select('id,username,display_name,avatar_path,is_private,favorites').eq('account_suspended',false).order('username').limit(8));}catch{try{people=await result(db.from('profiles').select('id,username,display_name,avatar_path,is_private').order('username').limit(8));}catch{people=[];}}}
 if(request!==loadId)return;
 $('#explore-people').innerHTML=(await Promise.all(people.slice(0,8).map(async person=>`<button type="button" class="people-card" data-explore-person="${person.id}">${await avatar(person)}<strong>${esc(person.display_name)}</strong><span>@${esc(person.username)}</span></button>`))).join('')||'<p class="small">Creators you can follow will show up here.</p>';
 $('#explore-people').querySelectorAll('[data-explore-person]').forEach(button=>button.onclick=()=>{routeProfileId=button.dataset.explorePerson;view='profile';load().catch(fail);});
 const hydrated=await experience.hydrate(posts);
 if(request!==loadId)return;
 const tiles=posts.map(post=>{
  const pack=hydrated.get(post.id);
  const url=post.spoiler?null:pack?.urls?.[post.media_path];
  const label=esc(post.series||post.profiles?.display_name||'Post');
  const badge=postTypeBadge(post);
  const stack=(pack?.attachments||[]).length?'<span class="tile-stack" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="7" y="3" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="7" width="12" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>':'';
  const dwell=` data-dwell="${post.id}" data-series="${esc(post.series||'')}" data-author="${post.author||''}" data-type="${postTypeKey(post)}" data-tags="${esc(hashtags(post.body).join(' '))}"`;
  if(post.spoiler)return `<button type="button" class="explore-tile"${dwell} data-explore-post="${post.id}">${badge}<span class="tile-text">Spoiler</span><span class="explore-tile-label">${label}</span></button>`;
  if(post.media_type==='video'&&url){const posterPath=post.media_posters?.[post.media_path],poster=posterPath?pack?.urls?.[posterPath]:'';return `<div class="explore-tile" role="button" tabindex="0"${dwell} data-explore-post="${post.id}"><video muted loop playsinline preload="none" ${poster?`poster="${esc(poster)}"`:''} data-preview="${esc(url)}" data-inline></video><button type="button" class="ig-mute explore-sound" aria-label="Turn on sound" aria-pressed="false"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="m16 10 4 4m0-4-4 4"/></svg></button><span class="tile-reel" aria-hidden="true">▶</span>${stack}${badge}<span class="explore-tile-label">${label}</span></div>`;}
  if(!url){if(exploreFilter==='foryou'&&!personalized)return '';return `<button type="button" class="explore-tile explore-text"${dwell} data-explore-post="${post.id}">${badge}<span class="tile-text">${esc(post.title||post.series||(post.body||'').slice(0,80)||'Discussion')}</span><span class="explore-tile-label">${label}</span></button>`;}
  return `<button type="button" class="explore-tile"${dwell} data-explore-post="${post.id}"><img loading="lazy" alt="${label}" src="${esc(url)}">${stack}${badge}<span class="explore-tile-label">${label}</span></button>`;
 }).join('');
 let grid=tiles;
 if(!grid&&term.length<2&&exploreFilter==='foryou'&&!personalized){
  const discussions=await result(db.from('posts').select('id,title,body,series,kind,spoiler,profiles!posts_author_fkey(display_name)').eq('status','approved').not('kind','in','(avatar,story)').order('created_at',{ascending:false}).limit(18));
  if(request!==loadId)return;
  grid=discussions.map(post=>`<button type="button" class="explore-tile explore-text" data-explore-post="${post.id}"><span class="tile-text">${esc(post.spoiler?'Spoiler':(post.title||post.series||(post.body||'').slice(0,80)||'Discussion'))}</span><span class="explore-tile-label">${esc(post.profiles?.display_name||post.kind||'Post')}</span></button>`).join('');
 }
 $('#explore-grid').innerHTML=grid||`<p class="small explore-empty">${exploreFilter==='theory'?'No theories to explore yet.':exploreFilter==='chapters'?'No chapter reviews to explore yet.':exploreFilter==='episodes'?'No episode reviews to explore yet.':'No media posts match that search yet.'}</p>`;
 $('#explore-grid').querySelectorAll('[data-explore-post]').forEach(button=>{const open=()=>community.openPost(button.dataset.explorePost).catch(fail);button.onclick=event=>{if(event.target.closest('.ig-mute'))return;open();};if(button.getAttribute('role')==='button')button.onkeydown=event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.ig-mute')){event.preventDefault();open();}};});
 bindExplorePreviews($('#explore-grid'));interests.watch($('#explore-grid'));
}
async function openHashtag(tag){
 const clean=String(tag||'').replace(/[^A-Za-z0-9_]/g,'');
 if(!clean)return;
 closeModalOnly();
 view='explore';
 history.pushState({view:'explore'},'','/explore?tag='+encodeURIComponent(clean));
 await load();
}
async function openMention(username){
 const row=await result(db.from('profiles').select('id').eq('username',String(username||'').toLowerCase()).maybeSingle());
 if(!row){toast('No one goes by @'+username+'.');return;}
 closeModalOnly();
 routeProfileId=row.id;view='profile';
 if(location.pathname!=='/u/'+String(username).toLowerCase())history.pushState({view:'profile',id:row.id},'','/u/'+String(username).toLowerCase());
 await load();
}
function applyTheme(theme){
 document.documentElement.dataset.theme=theme;
 const meta=document.querySelector('meta[name="theme-color"]');
 if(meta)meta.content=theme==='light'?'#ffffff':'#000000';
 const light=theme==='light';
 document.querySelectorAll('#theme-toggle,#theme-toggle-mobile').forEach(button=>{
  button.setAttribute('aria-label',light?'Switch to dark mode':'Switch to light mode');
  button.setAttribute('aria-pressed',String(light));
 });
}
function initTheme(){
 let theme;try{theme=localStorage.getItem('fictioncom-theme');}catch{theme=null;}
 if(theme!=='light'&&theme!=='dark')theme=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
 applyTheme(theme);
 document.querySelectorAll('#theme-toggle,#theme-toggle-mobile').forEach(button=>button.onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('fictioncom-theme',next);}catch{}applyTheme(next);});
}
document.addEventListener('click',event=>{
 const hash=event.target.closest?.('[data-hashtag]');
 if(hash){event.preventDefault();openHashtag(hash.dataset.hashtag).catch(fail);return;}
 const mention=event.target.closest?.('[data-mention]');
 if(mention){event.preventDefault();openMention(mention.dataset.mention).catch(fail);}
});
window.addEventListener('popstate',()=>{routing=true;if($('#modal')?.open)closeModalOnly();routing=false;handleRoute().catch(fail);});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});