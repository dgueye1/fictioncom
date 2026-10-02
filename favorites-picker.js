import {attachCatalog} from './catalog.js';

export function attachFavorites(input){
 const selected=input.value.trim()?input.value.split(' · '):[];
 const chips=document.createElement('div');chips.className='favorite-selections';chips.setAttribute('aria-label','Selected favorite series');
 input.before(chips);input.value='';input.placeholder='Search anime or manga…';
 const status=document.createElement('p');status.className='small';status.setAttribute('role','status');input.after(status);
 const value=()=>selected.join(' · ');
 function render(){chips.replaceChildren();selected.forEach((label,i)=>{const button=document.createElement('button');button.type='button';button.className='favorite-chip';button.textContent=label+' ×';button.setAttribute('aria-label','Remove '+label);button.onclick=()=>{selected.splice(i,1);status.textContent='';render();};chips.append(button);});}
 const picker=attachCatalog(input,{getMedium:()=>null,onSelect(item){
  if(!selected.includes(item.label)){
   if([...selected,item.label].join(' · ').length>300){status.textContent='Remove a favorite before adding another.';picker.reset();return;}
   selected.push(item.label);render();
  }
  status.textContent='Favorite added. Search to add another.';picker.reset();
 }});
 render();return {value,close:picker.close};
}
