import {attachCatalog} from './catalog.js';
import {coerceMediaFile,configureCaptureButtons,validateMedia} from './media-validation.js?v=20261128c';
import {getDraft,saveDraft,deleteDraft} from './drafts.js';
import {attachMentionSearch} from './text-links.js';
import {openMediaEditor} from './media-editor.js';
import {frameUrl,mountPreviewVideo,overlayHtml} from './media-overlays.js';
import {recordClip} from './video-recorder.js';

const KINDS={
  post:'Post',
  theory:'Theory',
  'reaction-manga':'Chapter review',
  'reaction-anime':'Episode review'
};
const ACCEPT='image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov,.mp4,.m4v';

export function createComposer({$,esc,toast,modal,close,guarded,requireProfile,createStory,getUser,getUsername=()=>'',getView,result,db,uploadMediaPost,searchUsers,onPublished}){
  return async function compose(defaultKind){
    if(defaultKind==='story'){createStory();return;}
    if(!requireProfile())return;
    const context=getView();
    const preset=context==='theory'?'theory':context==='episodes'?'reaction-anime':context==='chapters'?'reaction-manga':'post';
    modal(`<div class="composer"><header class="composer-bar"><button type="button" class="composer-x" id="composer-dismiss" aria-label="Close"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button><h2>New post</h2><button type="submit" class="composer-share" id="publish-post" form="post-form">Share</button></header><div class="composer-tabs" role="tablist" aria-label="Create"><button type="button" id="tab-media" role="tab" aria-selected="true">Photo / Video</button><button type="button" id="tab-text" role="tab" aria-selected="false">Text</button></div><form id="post-form"><label>Post type<select id="post-kind">${Object.entries(KINDS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><div id="episode-wrap" hidden><label id="episode-label">Chapter<input id="episode" type="number" min="1" max="100000" required></label></div><div id="pane-media"><div id="dropzone" class="dropzone" tabindex="0"><strong>Drop photos or videos</strong><span>JPG, PNG, WebP, MP4, MOV, or WebM · mix up to 6</span><button type="button" id="add-post-media" class="primary">Select from device</button></div><div id="attachment-order" class="composer-selected"></div><div class="capture-actions"><button type="button" id="take-post-photo">Take photo</button><button type="button" id="take-post-video">Record video</button></div></div><div id="pane-text" hidden><label>Title<input id="title" maxlength="120" placeholder="Optional headline"></label><a id="large-editor" class="text-button" target="_blank">Open writing editor in a new tab</a></div><label>Caption<textarea id="body" maxlength="5000" placeholder="Write a caption, theory, or #hashtag…"></textarea></label><label>Anime or manga<input id="series" maxlength="100" placeholder="Tag a series"></label><label class="check"><input id="spoiler" type="checkbox"> Contains spoilers</label><input id="media" type="file" multiple accept="${ACCEPT}" hidden><input id="post-camera-photo" type="file" accept="image/*" capture="environment" hidden><input id="post-camera-video" type="file" accept="video/*" capture="environment" hidden><p id="draft-status" class="small" role="status">Drafts save on this device.</p><button type="button" id="discard-draft" class="text-button">Discard draft</button><div id="upload-status" hidden><progress id="upload-progress" max="100" value="0"></progress><span id="upload-label" role="status"></span></div><p class="small">Up to 6 attachments, 10 MB each. Videos up to 60 seconds. No nudity or inappropriate content.</p><label class="check"><input type="checkbox" required> My content follows the community rules.</label></form></div>`);
    $('#modal').classList.add('compose-modal');
    $('#composer-dismiss').onclick=()=>close();
    if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
    const form=$('#post-form'),field=id=>form.querySelector('#'+id),owner=getUser().id,draftKey=owner+':'+context;
    let mode='media',postSeries=null,files=[],activeIndex=0,published=false,timer,writeQueue=Promise.resolve(),previewUrls=[];
    configureCaptureButtons(field('take-post-photo'),field('take-post-video'),field('post-camera-photo'),field('post-camera-video'));
    field('take-post-photo').onclick=()=>field('post-camera-photo').click();
    field('take-post-video').onclick=()=>recordClip({host:$('#modal'),onDone:file=>addMediaFiles([file]),onFallback:()=>field('post-camera-video').click()});
    field('add-post-media').onclick=()=>field('media').click();
    field('post-kind').value=preset;
    const status=message=>{if(form.isConnected)field('draft-status').textContent=message;};
    const kindValue=()=>field('post-kind').value;
    const paintKind=()=>{
      const reaction=kindValue().startsWith('reaction');
      field('episode-wrap').hidden=!reaction;
      field('episode-label').firstChild.textContent=kindValue()==='reaction-manga'?'Chapter':'Episode';
      field('series').required=kindValue()!=='post';
      field('episode').required=reaction;
      field('body').required=mode==='text';
    };
    const paintMode=()=>{
      field('pane-media').hidden=mode!=='media';
      field('pane-text').hidden=mode!=='text';
      $('#tab-media').setAttribute('aria-selected',String(mode==='media'));
      $('#tab-text').setAttribute('aria-selected',String(mode==='text'));
      $('#publish-post').textContent=mode==='media'?'Share':'Publish';
      paintKind();
    };
    $('#tab-media').onclick=()=>{mode='media';paintMode();};
    $('#tab-text').onclick=()=>{mode='text';paintMode();};
    field('post-kind').onchange=paintKind;
    paintMode();
    const snapshot=()=>({title:field('title').value,body:field('body').value,series:field('series').value,selected:postSeries,episode:field('episode').value,spoiler:field('spoiler').checked,kind:field('post-kind').value,mode,files:files.map(item=>({name:item.file.name,lastModified:item.file.lastModified,blob:item.file,overlays:item.overlays||[]}))});
    const persist=()=>{if(published)return writeQueue;const data=snapshot();writeQueue=writeQueue.catch(()=>{}).then(()=>saveDraft(draftKey,data)).then(()=>status('Draft saved on this device.'),()=>status('Device storage is unavailable. Keep this window open to retain your draft.'));return writeQueue;};
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(persist,250);};
    const picker=attachCatalog(field('series'),{getMedium:()=>kindValue()==='reaction-anime'?'anime':kindValue()==='reaction-manga'?'manga':null,onSelect:item=>{postSeries=item;schedule();},onClear:()=>{postSeries=null;schedule();}});
    function attachments(){
      previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];
      const order=field('attachment-order');
      field('dropzone').classList.toggle('has-files',files.length>0);
      if(!files.length){order.innerHTML='';return;}
      activeIndex=Math.max(0,Math.min(activeIndex,files.length-1));
      const current=files[activeIndex];
      const url=URL.createObjectURL(current.file);previewUrls.push(url);
      const video=String(current.file.type||'').startsWith('video/');
      const thumbs=files.map((item,index)=>{
        const thumbUrl=URL.createObjectURL(item.file);previewUrls.push(thumbUrl);
        const media=String(item.file.type||'').startsWith('video/')?`<video muted playsinline webkit-playsinline preload="metadata" src="${esc(frameUrl(thumbUrl))}"></video>`:`<img src="${esc(thumbUrl)}" alt="">`;
        return `<div class="composer-thumb${index===activeIndex?' on':''}" draggable="true" data-index="${index}">${media}<button type="button" class="composer-thumb-x" data-remove-attachment="${index}" aria-label="Remove">×</button><button type="button" class="composer-thumb-move prev" data-move-attachment="${index}" data-direction="-1" ${index===0?'disabled':''} aria-label="Move earlier">‹</button><button type="button" class="composer-thumb-move next" data-move-attachment="${index}" data-direction="1" ${index===files.length-1?'disabled':''} aria-label="Move later">›</button></div>`;
      }).join('');
      order.innerHTML=`<div class="composer-frame">${video?`<video muted playsinline webkit-playsinline preload="metadata" src="${esc(frameUrl(url))}"></video>`:`<img src="${esc(url)}" alt="Selected photo">`}${overlayHtml(current.overlays,esc)}${video?'<span class="composer-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="#fff" d="M8 5v14l11-7Z"/></svg></span><span class="composer-duration" data-duration>0:00</span>':''}</div><div class="composer-strip">${thumbs}</div>`;
      order.querySelectorAll('video').forEach(mountPreviewVideo);
      order.querySelectorAll('.composer-thumb').forEach(thumb=>{
        thumb.addEventListener('click',event=>{if(event.target.closest('button'))return;activeIndex=Number(thumb.dataset.index);attachments();});
        thumb.addEventListener('dragstart',event=>{if(event.target.closest('button')){event.preventDefault();return;}event.dataTransfer.setData('text/plain',thumb.dataset.index);event.dataTransfer.effectAllowed='move';});
        thumb.addEventListener('dragover',event=>event.preventDefault());
        thumb.addEventListener('drop',event=>{
          event.preventDefault();
          const from=Number(event.dataTransfer.getData('text/plain')),to=Number(thumb.dataset.index);
          if(!Number.isInteger(from)||from===to)return;
          const [item]=files.splice(from,1);
          files.splice(to,0,item);
          if(activeIndex===from)activeIndex=to;
          attachments();schedule();
        });
      });
      order.querySelectorAll('[data-move-attachment]').forEach(button=>button.onclick=event=>{event.stopPropagation();const index=Number(button.dataset.moveAttachment),next=index+Number(button.dataset.direction);if(next<0||next>=files.length)return;[files[index],files[next]]=[files[next],files[index]];if(activeIndex===index)activeIndex=next;else if(activeIndex===next)activeIndex=index;attachments();schedule();});
      order.querySelectorAll('[data-remove-attachment]').forEach(button=>button.onclick=event=>{event.stopPropagation();files.splice(Number(button.dataset.removeAttachment),1);attachments();schedule();});
    }
    async function addMediaFiles(chosen){
      if(files.length+chosen.length>6){toast('Choose up to six attachments.');return;}
      for(const raw of chosen){
        const file=coerceMediaFile(raw);
        try{await validateMedia(file,60);}
        catch(error){toast(error.message);continue;}
        if(!form.isConnected)return;
        const edited=await openMediaEditor({file,purpose:'post',username:getUsername()||'',series:postSeries?.title||field('series').value.trim()});
        if(!edited||!form.isConnected)continue;
        files.push({file:edited.file,overlays:edited.overlays||[]});
        activeIndex=files.length-1;
        attachments();schedule();
      }
    }
    async function addMedia(input){const chosen=[...input.files];input.value='';await addMediaFiles(chosen);}
    for(const id of ['media','post-camera-photo','post-camera-video'])field(id).onchange=()=>addMedia(field(id));
    const drop=field('dropzone');
    ['dragenter','dragover'].forEach(name=>drop.addEventListener(name,event=>{event.preventDefault();drop.classList.add('drag');}));
    ['dragleave','drop'].forEach(name=>drop.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('drag');}));
    drop.addEventListener('drop',event=>{if(event.dataTransfer?.files?.length)addMediaFiles([...event.dataTransfer.files]);});
    drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();field('media').click();}});
    form.addEventListener('input',schedule);
    attachMentionSearch(field('body'),{search:searchUsers});
    try{
      const saved=await getDraft(draftKey);
      if(saved&&form.isConnected){
        field('title').value=saved.title||'';
        field('body').value=saved.body||'';
        field('series').value=saved.series||'';
        postSeries=saved.selected||null;
        if(postSeries)picker.setSelection(postSeries);
        field('episode').value=saved.episode||'';
        field('spoiler').checked=!!saved.spoiler;
        if(saved.kind&&KINDS[saved.kind])field('post-kind').value=saved.kind;
        if(saved.mode==='text'||saved.mode==='media')mode=saved.mode;
        files=(saved.files||[]).map(entry=>{const file=new File([entry.blob],entry.name,{type:entry.blob?.type||'',lastModified:entry.lastModified});return {file,overlays:Array.isArray(entry.overlays)?entry.overlays:[]};});
        paintMode();attachments();status('Restored your saved draft, including attachments.');
      }
    }catch{status('Device storage is unavailable. Keep this window open to retain your draft.');}
    field('discard-draft').onclick=async()=>{clearTimeout(timer);await writeQueue;await deleteDraft(draftKey).catch(()=>{});form.reset();postSeries=null;picker.reset();files=[];activeIndex=0;mode='media';field('post-kind').value=preset;paintMode();attachments();status('Draft discarded.');};
    if(!form.isConnected||!$('#modal').open)return;
    const draftId=crypto.randomUUID();
    const channel=new BroadcastChannel('fictioncom-draft-'+draftId);
    const legacy=new BroadcastChannel('animecom-draft-'+draftId);
    const onChannel=event=>{
      if(!form.isConnected)return;
      if(event.data?.type==='body'&&typeof event.data.body==='string'){field('body').value=event.data.body.slice(0,5000);schedule();}
      if(event.data?.type==='ready'){const message={type:'body',body:field('body').value};channel.postMessage(message);legacy.postMessage(message);}
    };
    channel.onmessage=onChannel;legacy.onmessage=onChannel;
    field('body').addEventListener('input',()=>{const message={type:'body',body:field('body').value};channel.postMessage(message);legacy.postMessage(message);});
    field('large-editor').href='/write.html#'+draftId;
    $('#modal').addEventListener('close',()=>{clearTimeout(timer);if(!published)persist();previewUrls.forEach(URL.revokeObjectURL);const message={type:'closed'};channel.postMessage(message);legacy.postMessage(message);channel.close();legacy.close();},{once:true});
    form.onsubmit=guarded(async()=>{
      const selectedKind=kindValue();
      const reaction=selectedKind.startsWith('reaction');
      const kind=reaction?'reaction':selectedKind;
      const medium=selectedKind==='reaction-manga'?'manga':(postSeries?.medium||(selectedKind==='reaction-anime'?'anime':'anime'));
      if(kind!=='post'&&!postSeries)throw Error('Choose a series from the suggestions.');
      if(reaction&&!field('episode').value)throw Error(selectedKind==='reaction-manga'?'Add a chapter number.':'Add an episode number.');
      if(mode==='media'&&!files.length&&kind==='post')throw Error('Add a photo or video, or switch to Text.');
      if(mode==='text'&&!field('body').value.trim()&&!files.length)throw Error('Write something before publishing.');
      await persist();
      const post={author:owner,kind,title:mode==='text'?field('title').value:'',body:field('body').value,series:postSeries?.title||field('series').value.trim(),medium:postSeries?.medium||medium,episode:reaction?Number(field('episode').value):null,spoiler:field('spoiler').checked};
      const uploads=files.map(item=>{const file=item.file;file.fictionOverlays=item.overlays||[];return file;});
      if(uploads.length){
        field('upload-status').hidden=false;
        try{await uploadMediaPost(uploads,post,fraction=>{if(form.isConnected){field('upload-progress').value=Math.round(fraction*100);field('upload-label').textContent=Math.round(fraction*100)+'% uploaded';}});}
        catch(error){field('upload-label').textContent='Upload failed. Your draft is retained; press Share to retry.';throw error;}
      }else await result(db.from('posts').insert(post));
      published=true;clearTimeout(timer);await writeQueue;await deleteDraft(draftKey).catch(()=>{});
      const message={type:'published'};channel.postMessage(message);legacy.postMessage(message);
      close();toast('Your post is live.');await onPublished?.(reaction?(medium==='manga'?'chapters':'episodes'):kind==='theory'?'theory':'feed');
    });
  };
}
