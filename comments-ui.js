import {attachRichComposer,composerBody,clearComposer,renderRichBody} from './rich-replies.js';
import {attachMentionSearch} from './text-links.js';

const EMOJI=['❤️','🙌','🔥','👏','😢','😍','😮','😂'];

function relTime(date){
  const sec=Math.max(0,(Date.now()-new Date(date).getTime())/1000);
  if(sec<45)return 'Just now';
  if(sec<3600)return Math.max(1,Math.floor(sec/60))+'m';
  if(sec<86400)return Math.floor(sec/3600)+'h';
  if(sec<604800)return Math.floor(sec/86400)+'d';
  if(sec<31536000)return Math.floor(sec/604800)+'w';
  return Math.floor(sec/31536000)+'y';
}

export function createComments({db,$,esc,result,toast,fail,guarded,requireProfile,getUser,getMe,isEnhanced,showProfile,avatar,searchUsers,closeLayer,openLayer,renderDetailMedia}){
  const uid=()=>getUser()?.id;
  return async function conversation(id,parent=null,page=0,draft='',sortOrder='newest',knownPost=null){
    const wide=matchMedia('(min-width:900px)').matches;
    const post=knownPost||await result(db.from('posts').select('*,profiles!posts_author_fkey(*)').eq('id',id).maybeSingle());
    if(!post){toast('This post is no longer available to you.');return;}
    openLayer(wide?'detail':'comments');
    if(wide&&renderDetailMedia)await renderDetailMedia(post);
    const host=document.querySelector(wide?'#post-detail-side':'#comment-sheet-body');
    if(!host)return;
    const rows=isEnhanced()?(await Promise.all(Array.from({length:page+1},(_,pageNumber)=>result(db.rpc('sorted_comments',{target:id,sort_order:sortOrder,page_number:pageNumber}).select('*,profiles!comments_author_fkey(*)'))))).flat():await result(db.from('comments').select('*,profiles!comments_author_fkey(*)').eq('post_id',id).order('created_at').range(0,(page+1)*50-1));
    let counts=new Map();
    if(rows.length){
      const stats=await db.rpc('comment_like_stats',{targets:rows.map(comment=>comment.id)});
      if(!stats.error)counts=new Map((stats.data||[]).map(row=>[row.comment_id,row]));
    }
    async function row(comment){
      const stat=counts.get(comment.id)||{};
      const name=comment.profiles?.username||comment.profiles?.display_name||'member';
      return `<div class="comment-row" data-comment-row="${comment.id}"><button class="comment-avatar" data-comment-person="${comment.author}" aria-label="View ${esc(name)}">${await avatar(comment.profiles)}</button><div class="comment-content"><button data-comment-person="${comment.author}" class="text-button comment-name"><strong>${esc(name)}</strong></button> <span class="comment-text">${comment.spoiler?`<details><summary>Show spoiler</summary>${renderRichBody(comment.body)}</details>`:renderRichBody(comment.body)}</span><div class="comment-meta"><time>${relTime(comment.created_at)}</time><button data-reply="${comment.id}" class="text-button">Reply</button>${isEnhanced()&&comment.author===uid()?`<button data-edit-comment="${comment.id}" class="text-button">Edit</button><button data-delete-comment="${comment.id}" class="text-button">Delete</button>`:''}</div></div><button class="comment-heart ${stat.liked?'liked':''}" data-comment-like="${comment.id}" data-liked="${!!stat.liked}" aria-label="${stat.liked?'Unlike':'Like'} comment" aria-pressed="${!!stat.liked}">${stat.liked?'♥':'♡'}<span>${stat.likes||0}</span></button></div>`;
    }
    const roots=rows.filter(comment=>!comment.parent_id||!rows.some(row=>row.id===comment.parent_id));
    async function thread(comment){
      const children=rows.filter(row=>row.parent_id===comment.id);
      return await row(comment)+(children.length?`<details class="comment-replies" data-replies-for="${comment.id}"><summary>View replies (${children.length})</summary>${(await Promise.all(children.map(thread))).join('')}</details>`:'');
    }
    const listHtml=(await Promise.all(roots.map(thread))).join('')||'<p class="small comment-empty">No comments yet.</p>';
    const emoji=EMOJI.map(item=>`<button type="button" class="emoji-pick" data-emoji="${item}" aria-label="Insert ${item}">${item}</button>`).join('');
    const composer=uid()?`<form id="thread-form" class="comment-composer"><div id="reply-context"></div><div class="emoji-picks">${emoji}</div><label class="sr-only" for="thread-body">Add a comment</label><textarea id="thread-body" maxlength="2000" required placeholder="Add a comment…" rows="1">${esc(draft)}</textarea><button class="primary" type="submit">Post</button></form>`:'<button id="reply-signin" class="primary comment-login" type="button">Log in to comment</button>';
    const list=`${wide?`<header class="detail-author"><strong>${esc(post.profiles?.username||'member')}</strong></header><p class="detail-caption"><strong>${esc(post.profiles?.username||'member')}</strong> ${esc(post.body||'')}</p>`:''}<div class="comments-list">${listHtml}${rows.length===(page+1)*50?'<button type="button" id="more-comments" class="text-button">View more comments</button>':''}</div>`;
    const phoneDock=document.querySelector('#comment-sheet-dock');
    if(!wide&&phoneDock){host.innerHTML=list;phoneDock.innerHTML=composer;}
    else{host.innerHTML=list;host.insertAdjacentHTML('beforeend','<div class="comment-dock">'+composer+'</div>');}
    const setReply=replyId=>{
      parent=replyId;
      const name=rows.find(comment=>comment.id===replyId)?.profiles?.username;
      const slot=$('#reply-context');
      if(!slot)return;
      slot.innerHTML=replyId?'Replying to <strong>'+esc(name||'member')+'</strong> <button type="button" id="cancel-reply" class="text-button">Cancel</button>':'';
      if(replyId)$('#cancel-reply').onclick=()=>setReply(null);
    };
    if(uid())setReply(parent);
    function bindCommentActions(){
      host.querySelectorAll('[data-comment-person]').forEach(button=>button.onclick=()=>{closeLayer(false);showProfile(button.dataset.commentPerson);});
      host.querySelectorAll('[data-reply]').forEach(button=>button.onclick=()=>{if(requireProfile()){setReply(button.dataset.reply);$('#thread-body')?.focus();}});
      host.querySelectorAll('[data-comment-like]').forEach(button=>button.onclick=async()=>{
        if(!requireProfile())return;
        const liked=button.dataset.liked==='true';
        const count=Number(button.querySelector('span').textContent)||0;
        const next=!liked;
        button.dataset.liked=String(next);
        button.classList.toggle('liked',next);
        button.setAttribute('aria-pressed',String(next));
        button.firstChild.textContent=next?'♥':'♡';
        button.querySelector('span').textContent=String(Math.max(0,count+(next?1:-1)));
        try{
          await result(next?db.from('comment_likes').insert({comment_id:button.dataset.commentLike,user_id:uid()}):db.from('comment_likes').delete().eq('comment_id',button.dataset.commentLike).eq('user_id',uid()));
        }catch(error){
          button.dataset.liked=String(liked);
          button.classList.toggle('liked',liked);
          button.querySelector('span').textContent=String(count);
          fail(error);
        }
      });
    }
    function bindManage(){
      host.querySelectorAll('[data-edit-comment],[data-delete-comment]').forEach(button=>button.onclick=()=>{
        if(!requireProfile())return;
        const target=button.dataset.editComment||button.dataset.deleteComment;
        const comment=rows.find(row=>row.id===target);
        const block=host.querySelector('[data-comment-row="'+target+'"] .comment-content');
        if(!block||!comment)return;
        if(button.dataset.deleteComment){
          block.insertAdjacentHTML('beforeend','<div class="inline-confirm"><p>Delete this comment?</p><button type="button" id="confirm-delete-comment" class="danger">Delete</button><button type="button" id="cancel-inline">Cancel</button></div>');
          block.querySelector('#cancel-inline').onclick=()=>block.querySelector('.inline-confirm')?.remove();
          block.querySelector('#confirm-delete-comment').onclick=async()=>{
            try{await result(db.rpc('delete_comment',{target}));toast('Comment deleted.');await conversation(id,null,page,'',sortOrder,post);}catch(error){fail(error);}
          };
          return;
        }
        block.insertAdjacentHTML('beforeend','<form id="inline-edit"><textarea id="edited-comment" maxlength="2000" required>'+esc(comment.body)+'</textarea><button class="primary" type="submit">Save</button><button type="button" id="cancel-inline">Cancel</button></form>');
        block.querySelector('#cancel-inline').onclick=()=>block.querySelector('#inline-edit')?.remove();
        block.querySelector('#inline-edit').onsubmit=async event=>{
          event.preventDefault();
          try{await result(db.rpc('edit_comment',{target,new_body:composerBody(block.querySelector('#edited-comment'))}));toast('Comment updated.');await conversation(id,null,page,'',sortOrder,post);}catch(error){fail(error);}
        };
      });
    }
    bindCommentActions();
    bindManage();
    if($('#more-comments'))$('#more-comments').onclick=()=>conversation(id,parent,page+1,$('#thread-body')?composerBody($('#thread-body')):'',sortOrder,post).catch(fail);
    if(!uid()){$('#reply-signin').onclick=requireProfile;return;}
    (host.closest('#comment-sheet,#post-detail')||host).querySelectorAll('[data-emoji]').forEach(button=>button.onclick=()=>{
      const input=$('#thread-body');
      if(!input)return;
      input.value=(input.value+button.dataset.emoji).slice(0,2000);
      input.focus();
    });
    attachRichComposer($('#thread-body'));
    if(searchUsers)attachMentionSearch($('#thread-body'),{search:searchUsers});
    $('#thread-form').onsubmit=guarded(async()=>{
      if(!requireProfile())return;
      const input=$('#thread-body');
      const body=composerBody(input);
      const replyTo=parent;
      if(!body)throw Error('Write a comment first.');
      const created=await result(db.from('comments').insert({post_id:id,author:uid(),body,parent_id:replyTo,spoiler:false,episode:null}).select('*,profiles!comments_author_fkey(*)').single());
      rows.push(created);
      counts.set(created.id,{likes:0,liked:false});
      const html=await row(created);
      const list=host.querySelector('.comments-list');
      list.querySelector('.comment-empty')?.remove();
      if(replyTo){
        const root=list.querySelector('[data-comment-row="'+replyTo+'"]');
        let replies=list.querySelector('[data-replies-for="'+replyTo+'"]');
        if(!replies&&root){root.insertAdjacentHTML('afterend','<details class="comment-replies" open data-replies-for="'+replyTo+'"><summary></summary></details>');replies=root.nextElementSibling;}
        if(replies){
          replies.open=true;
          replies.insertAdjacentHTML('beforeend',html);
          const count=rows.filter(row=>row.parent_id===replyTo).length;
          replies.querySelector('summary').textContent='View replies ('+count+')';
        }else list.insertAdjacentHTML('beforeend',html);
      }else list.insertAdjacentHTML(sortOrder==='newest'?'afterbegin':'beforeend',html);
      bindCommentActions();
      bindManage();
      clearComposer(input);
      setReply(null);
      document.querySelectorAll('[data-comments="'+id+'"]').forEach(button=>{
        if(button.classList.contains('ig-comments-link')){
          const count=(Number(button.textContent.match(/\d+/)?.[0]||0))+1;
          button.textContent='View all '+count+' comments';
        }
      });
    });
  };
}
