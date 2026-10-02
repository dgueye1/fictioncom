// Opening a group changes strip order, independently of actual media view counts.
export function storyGroupOpened(posts, author, history={}) {
 const entry=history[author],items=posts.filter(p=>p.author===author);
 return Boolean(items.length&&entry&&Array.isArray(entry.ids)&&items.every(p=>entry.ids.includes(p.id)));
}
export function storyGroups(posts, ownId, history={}, following=new Set()) {
 const groups=new Map();
 for(const p of posts){if(p.author===ownId)continue;if(!groups.has(p.author))groups.set(p.author,[]);groups.get(p.author).push(p);}
 return [...groups.values()].map(items=>{
  const entry=history[items[0].author];
  const opened=storyGroupOpened(posts,items[0].author,history);
  return {post:items[0],opened,time:opened?Number(entry.at)||0:0,followed:following.has(items[0].author),latest:Math.max(...items.map(p=>Date.parse(p.created_at)||0))};
 }).sort((a,b)=>Number(a.opened)-Number(b.opened)||(a.opened?a.time-b.time:Number(b.followed)-Number(a.followed)||b.latest-a.latest));
}
export function rememberStoryGroup(posts, author, history={}, now=Date.now()) {
 const active=new Set(posts.map(p=>p.author)),next={};
 for(const [id,entry] of Object.entries(history))if(active.has(id))next[id]=entry;
 next[author]={ids:posts.filter(p=>p.author===author).map(p=>p.id),at:now};
 return next;
}
