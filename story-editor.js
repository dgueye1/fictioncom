import {coerceMediaFile,configureCaptureButtons,validateMedia} from './media-validation.js?v=20261128c';
import {openMediaEditor} from './media-editor.js';
import {recordClip} from './video-recorder.js';

function picker(){
 return new Promise(resolve=>{
  const root=document.createElement('div');
  root.id='ig-editor';
  root.className='ig-editor ig-editor-standalone ig-story-picker';
  document.body.append(root);
  document.body.classList.add('ig-tool-open');
  root.innerHTML=`<button type="button" class="ig-editor-close" id="ig-pick-close" aria-label="Close">×</button><div class="ig-story-pick"><h2>Your story</h2><p>Add a photo or a video, then share it. Videos can be up to 60 seconds and 10 MB.</p><button type="button" id="choose-story-photo" class="primary">Choose photo or video</button><div class="capture-actions"><button type="button" id="take-story-photo">Take photo</button><button type="button" id="take-story-video">Record video</button></div><p id="story-pick-error" class="error" role="alert"></p></div><input id="story-photo" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov,.mp4" hidden><input id="story-camera-photo" type="file" accept="image/*" capture="environment" hidden><input id="story-camera-video" type="file" accept="video/*" capture="environment" hidden>`;
  const $=sel=>root.querySelector(sel);
  const done=value=>{root.remove();if(!document.querySelector('#ig-editor,#ig-recorder'))document.body.classList.remove('ig-tool-open');resolve(value);};
  const take=async raw=>{
   const file=coerceMediaFile(raw);
   try{await validateMedia(file,60);done(file);}
   catch(error){$('#story-pick-error').textContent=error.message||"Please upload a video that's 60 seconds or shorter.";}
  };
  $('#ig-pick-close').onclick=()=>done(null);
  configureCaptureButtons($('#take-story-photo'),$('#take-story-video'),$('#story-camera-photo'),$('#story-camera-video'));
  $('#choose-story-photo').onclick=()=>$('#story-photo').click();
  $('#take-story-photo').onclick=()=>$('#story-camera-photo').click();
  $('#take-story-video').onclick=()=>recordClip({host:null,onDone:file=>take(file),onFallback:()=>$('#story-camera-video').click()});
  for(const id of ['story-photo','story-camera-photo','story-camera-video'])$('#'+id).onchange=event=>{const file=event.target.files?.[0];event.target.value='';if(file)take(file);};
 });
}

export async function openStoryEditor({onPublish,username='',series=''}){
 const file=await picker();
 if(!file)return;
 const edited=await openMediaEditor({file,purpose:'story',username,series});
 if(!edited)return;
 await onPublish(edited.file,{kind:'story',title:'',body:'',series:edited.series||'',medium:edited.medium||'anime',episode:edited.episode,spoiler:!!edited.spoiler,overlays:edited.overlays||[]});
}
