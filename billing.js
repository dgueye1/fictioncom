export function createBilling({db,$,modal,esc,toast,getUser,auth,refresh}){
 let state={enabled:false,access:true},config={ready:false};
 async function status(){
  const response=await fetch('/api/billing/config');
  if(response.status===404&&!state.enabled){state={enabled:false,access:true};config={ready:false};return state;}
  if(!response.ok)throw Error('Membership status is unavailable. Please try again.');config=await response.json();
  if(!config.enabled){state={enabled:false,access:true};return state;}
  const r=await db.rpc('membership_status');if(r.error)throw Error('Membership status is unavailable. Please try again.');state=r.data;return state;
 }
 async function action(name){const {data,error}=await db.auth.getSession();if(error||!data.session)throw Error('Sign in again.');const r=await fetch('/api/billing/'+name,{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token}});const reply=await r.json();if(!r.ok)throw Error(reply.error);return reply;}
 async function open(){
  if(!getUser()){auth();return;}
  await status();
  const trialEnd=state.trial_ends_at?new Date(state.trial_ends_at):null,trial=trialEnd&&trialEnd>Date.now(),paid=state.subscription_status==='active'&&Date.parse(state.paid_until)>Date.now();
  modal(`<h2>FictionCom membership</h2><p><strong>7 days free, then $5 USD/month.</strong></p><p>No card is needed for your trial. After it ends, add a payment method and confirm your subscription to continue. Your subscription renews monthly until cancelled.</p>${config.mode==='test'?'<p class="status">Test mode · no real payments</p>':''}${!config.ready?'<p class="small">Billing setup is still in progress. Subscriptions are not open yet.</p>':state.moderator?'<p>Moderator access is included.</p>':paid?`<p>${state.cancel_at_period_end?'Access continues until':'Next billing period begins around'} ${esc(new Date(state.paid_until).toLocaleDateString())}.</p><button id="membership-portal">Manage subscription</button>`:trial?`<p>Your trial ends ${esc(trialEnd.toLocaleString())}. No payment will be taken automatically.</p>`:!trialEnd?'<button id="membership-trial" class="primary">Start my 7-day free trial</button>':`<p>Your free trial has ended. Your posts and account are still saved.</p><button id="membership-checkout" class="primary">Subscribe · $5/month</button>${state.subscription_status!=='none'?'<button id="membership-portal">Manage subscription</button>':''}`}<p class="small">You can still contact Support or manage/delete your account when your trial ends. Cancel future renewals through Manage subscription.</p><p id="membership-error" role="alert" class="error"></p>`);
  function bind(selector,fn){const b=$(selector);if(b)b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){if($('#membership-error'))$('#membership-error').textContent=e.message;else toast(e.message);}finally{if(b.isConnected)b.disabled=false;}};}
  bind('#membership-trial',async()=>{const r=await db.rpc('start_membership_trial');if(r.error)throw r.error;state=r.data;$('#modal').close();await refresh();toast('Your 7-day free trial has started.');});
  for(const [selector,endpoint,host] of [['#membership-checkout','checkout','checkout.stripe.com'],['#membership-portal','portal','billing.stripe.com']])bind(selector,async()=>{const r=await action(endpoint),url=new URL(r.url);if(url.protocol!=='https:'||url.hostname!==host)throw Error('Invalid payment destination.');location.assign(url.href);});
 }
 function gate(){if(state.enabled&&!state.access){open().catch(e=>toast(e.message));return false;}return true;}
 async function returned(){if(!new URLSearchParams(location.search).has('billing'))return;try{if(getUser())await action('refresh');await status();}finally{const url=new URL(location.href);url.searchParams.delete('billing');history.replaceState(null,'',url);}}
 function render(){return `<section class="empty"><h2>${getUser()?'Your FictionCom membership':'Join FictionCom'}</h2><p>Try the whole app free for 7 days. No card required. Then $5 USD/month.</p><button id="feed-membership" class="primary">${getUser()?'View membership':'Sign in to start'}</button></section>`;}
 return {status,open,gate,returned,render,blocked:()=>state.enabled&&!state.access};
}
