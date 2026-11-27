import {attachCatalog} from './catalog.js';
import {configureCaptureButtons,validateMedia} from './media-validation.js?v=20261127c';
import {getDraft,saveDraft,deleteDraft} from './drafts.js';
import {attachMentionSearch} from './text-links.js';

const KINDS={
  post:'Post',
  theory:'Theory',
  'reaction-manga':'Chapter review',
  'reaction-anime':'Episode review'
};

export function createComposer({$,esc,toast,modal,close,guarded,requireProfile,createStory,getUser,getView,result,db,uploadMediaPost,searchUsers,onPublished}){
  return async function compose(defaultKind){
    if(defaultKind==='story'){createStory();return;}
    if(!requireProfile())return;
    const context=getView();
    const preset=context==='theory'?'theory':context==='episodes'?'reaction-anime':context==='chapters'?'reaction-manga':'post';
    modal(`<div class="composer"><div class="composer-tabs" role="tablist" aria-label="Create"><button type="button" id="tab-media" role="tab" aria-selected="true">Photo / Video</button><button type="button" id="tab-text" role="tab" aria-selected="false">Text</button></div><form id="post-form"><label>Post type<select id="post-kind">${Object.entries(KINDS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><div id="episode-wrap" hidden><label id="episode-label">Chapter<input id="episode" type="number" min="1" max="100000" required></label></div><div id="pane-media"><div id="dropzone" class="dropzone" tabindex="0"><strong>Drop photos or videos</strong><span>JPG, PNG, WebP, MP4, or WebM · mix up to 6</span><button type="button" id="add-post-media" class="primary">Select from device</button></div><div class="aspect-picker" role="radiogroup" aria-label="Crop"><button type="button" data-aspect="original">Original</button><button type="button" data-aspect="1:1">1:1</button><button type="button" data-aspect="4:5" aria-pressed="true">4:5</button><button type="button" data-aspect="16:9">16:9</button></div><div id="attachment-order" class="composer-preview ratio-4-5"></div><div class="capture-actions"><button type="button" id="take-post-photo">Take photo</button><button type="button" id="take-post-video">Record video</button></div></div><div id="pane-text" hidden><label>Title<input id="title" maxlength="120" placeholder="Optional headline"></label><a id="large-editor" class="text-button" target="_blank">Open writing editor in a new tab</a></div><label>Caption<textarea id="body" maxlength="5000" placeholder="Write a caption, theory, or #hashtag…"></textarea></label><label>Anime or manga<input id="series" maxlength="100" placeholder="Tag a series"></label><label class="check"><input id="spoiler" type="checkbox"> Contains spoilers</label><input id="media" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" hidden><input id="post-camera-photo" type="file" accept="image/*" capture="environment" hidden><input id="post-camera-video" type="file" accept="video/*" capture="environment" hidden><p id="draft-status" class="small" role="status">Drafts save on this device.</p><button type="button" id="discard-draft" class="text-button">Discard draft</button><div id="upload-status" hidden><progress id="upload-progress" max="100" value="0"></progress><span id="upload-label" role="status"></span></div><p class="small">Up to 6 attachments, 10 MB each. Videos up to 5 minutes. No nudity or inappropriate content.</p><label class="check"><input type="checkbox" required> My content follows the community rules.</label><button class="primary" id="publish-post">Share</button></form></div>`);
    $('#modal').classList.add('compose-modal');
    const form=$('#post-form'),field=id=>form.querySelector('#'+id),owner=getUser().id,draftKey=owner+':'+context;
    let mode='media',postSeries=null,files=[],aspect='4:5',published=false,timer,writeQueue=Promise.resolve(),previewUrls=[];
    configureCaptureButtons(field('take-post-photo'),field('take-post-video'),field('post-camera-photo'),field('post-camera-video'));
    field('take-post-photo').onclick=()=>field('post-camera-photo').click();
    field('take-post-video').onclick=()=>field('post-camera-video').click();
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
      field('publish-post').textContent=mode==='media'?'Share':'Publish';
      paintKind();
    };
    $('#tab-media').onclick=()=>{mode='media';paintMode();};
    $('#tab-text').onclick=()=>{mode='text';paintMode();};
    field('post-kind').onchange=paintKind;
    paintMode();
    const snapshot=()=>({title:field('title').value,body:field('body').value,series:field('series').value,selected:postSeries,episode:field('episode').value,spoiler:field('spoiler').checked,kind:field('post-kind').value,mode,aspect,files:files.map(file=>({name:file.name,lastModified:file.lastModified,blob:file}))});
    const persist=()=>{if(published)return writeQueue;const data=snapshot();writeQueue=writeQueue.catch(()=>{}).then(()=>saveDraft(draftKey,data)).then(()=>status('Draft saved on this device.'),()=>status('Device storage is unavailable. Keep this window open to retain your draft.'));return writeQueue;};
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(persist,250);};
    const picker=attachCatalog(field('series'),{getMedium:()=>kindValue()==='reaction-anime'?'anime':kindValue()==='reaction-manga'?'manga':null,onSelect:item=>{postSeries=item;schedule();},onClear:()=>{postSeries=null;schedule();}});
    const paintAspect=()=>{
      form.querySelectorAll('[data-aspect]').forEach(button=>{
        const on=button.dataset.aspect===aspect;
        button.setAttribute('aria-pressed',String(on));
      });
      const preview=field('attachment-order');
      preview.classList.remove('ratio-original','ratio-1-1','ratio-4-5','ratio-16-9');
      preview.classList.add(aspect==='1:1'?'ratio-1-1':aspect==='16:9'?'ratio-16-9':aspect==='original'?'ratio-original':'ratio-4-5');
    };
    form.querySelectorAll('[data-aspect]').forEach(button=>button.onclick=()=>{aspect=button.dataset.aspect;paintAspect();schedule();});
    paintAspect();
    function attachments(){
      previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];
      const fit=aspect==='original'?'contain':'cover';
      field('attachment-order').innerHTML=files.map((file,index)=>{
        const url=URL.createObjectURL(file);previewUrls.push(url);
        const preview=file.type.startsWith('image/')?`<img src="${esc(url)}" alt="Preview ${index+1}" style="object-fit:${fit}">`:`<video src="${esc(url)}" muted playsinline style="object-fit:${fit}"></video>`;
        return `<div class="composer-tile">${preview}<span>${index+1}. ${esc(file.name)}</span><div class="composer-actions"><button type="button" data-move-attachment="${index}" data-direction="-1" ${index===0?'disabled':''} aria-label="Move attachment ${index+1} earlier">↑</button><button type="button" data-move-attachment="${index}" data-direction="1" ${index===files.length-1?'disabled':''} aria-label="Move attachment ${index+1} later">↓</button><button type="button" data-remove-attachment="${index}" aria-label="Remove attachment ${index+1}">×</button></div></div>`;
      }).join('');
      paintAspect();
      field('dropzone').classList.toggle('has-files',files.length>0);
      field('attachment-order').querySelectorAll('[data-move-attachment]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.moveAttachment),next=index+Number(button.dataset.direction);[files[index],files[next]]=[files[next],files[index]];attachments();schedule();});
      field('attachment-order').querySelectorAll('[data-remove-attachment]').forEach(button=>button.onclick=()=>{files.splice(Number(button.dataset.removeAttachment),1);attachments();schedule();});
    }
    async function addMediaFiles(chosen){
      if(files.length+chosen.length>6){toast('Choose up to six attachments.');return;}
      try{for(const file of chosen)await validateMedia(file,300);if(!form.isConnected)return;files.push(...chosen);attachments();schedule();}
      catch(error){toast(error.message);}
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
        if(['original','1:1','4:5','16:9'].includes(saved.aspect))aspect=saved.aspect;
        files=(saved.files||[]).map(file=>new File([file.blob],file.name,{type:file.blob.type,lastModified:file.lastModified}));
        paintMode();attachments();status('Restored your saved draft, including attachments.');
      }
    }catch{status('Device storage is unavailable. Keep this window open to retain your draft.');}
    field('discard-draft').onclick=async()=>{clearTimeout(timer);await writeQueue;await deleteDraft(draftKey).catch(()=>{});form.reset();postSeries=null;picker.reset();files=[];mode='media';aspect='4:5';field('post-kind').value=preset;paintMode();attachments();status('Draft discarded.');};
    if(!form.isConnected||!$('#modal').open)return;
    const draftId=crypto.randomUUID();
    const channel=new BroadcastChannel('fictioncom-draft-'+draftId);
    const legacy=new BroadcastChannel('animecom-draft-'+draftId);
    const publishBody=body=>channel.postMessage({type:'body',body});
    const onChannel=event=>{
      if(!form.isConnected)return;
      if(event.data?.type==='body'&&typeof event.data.body==='string'){field('body').value=event.data.body.slice(0,5000);schedule();}
      if(event.data?.type==='ready'){const message={type:'body',body:field('body').value};channel.postMessage(message);legacy.postMessage(message);}
    };
    channel.onmessage=onChannel;legacy.onmessage=onChannel;
    field('body').addEventListener('input',()=>{const message={type:'body',body:field('body').value};channel.postMessage(message);legacy.postMessage(message);});
    field('large-editor').href='write.html#'+draftId;
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
      const post={author:owner,kind,title:mode==='text'?field('title').value:'',body:field('body').value,series:postSeries?.title||field('series').value.trim(),medium:postSeries?.medium||medium,episode:reaction?Number(field('episode').value):null,spoiler:field('spoiler').checked};if(files.length)post.media_ratio=aspect;
      if(files.length){
        field('upload-status').hidden=false;
        try{await uploadMediaPost(files,post,fraction=>{if(form.isConnected){field('upload-progress').value=Math.round(fraction*100);field('upload-label').textContent=Math.round(fraction*100)+'% uploaded';}});}
        catch(error){field('upload-label').textContent='Upload failed. Your draft is retained; press Share to retry.';throw error;}
      }else await result(db.from('posts').insert(post));
      published=true;clearTimeout(timer);await writeQueue;await deleteDraft(draftKey).catch(()=>{});
      const message={type:'published'};channel.postMessage(message);legacy.postMessage(message);
      close();toast('Your post is live.');await onPublished?.(reaction?(medium==='manga'?'chapters':'episodes'):kind==='theory'?'theory':'feed');
    });
  };
}
