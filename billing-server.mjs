import {createHmac,timingSafeEqual} from 'node:crypto';
import {SUPABASE_URL,SUPABASE_KEY} from './config.js';

export function verifyStripeSignature(raw,signature,secret,now=Date.now()){
 const parts=String(signature||'').split(','),timestamp=parts.find(p=>p.startsWith('t='))?.slice(2);
 if(!secret||!/^\d+$/.test(timestamp||'')||Math.abs(now/1000-Number(timestamp))>300)return false;
 const expected=createHmac('sha256',secret).update(timestamp+'.').update(raw).digest();
 return parts.filter(p=>p.startsWith('v1=')).some(p=>{const s=p.slice(3);return /^[a-f0-9]{64}$/i.test(s)&&timingSafeEqual(expected,Buffer.from(s,'hex'));});
}
export function createBillingServer({env=process.env,request=fetch}={}){
 const enabled=false,key=env.STRIPE_SECRET_KEY,priceId=env.STRIPE_PRICE_ID,secret=env.STRIPE_WEBHOOK_SECRET,serviceKey=env.SUPABASE_SERVICE_ROLE_KEY;
 const origin=env.APP_ORIGIN,ready=Boolean(key&&priceId&&secret&&serviceKey&&origin);
 const mode=/^(sk|rk)_live_/.test(key||'')?'live':'test',budget=new Map();
 async function stripe(path,params=null,idempotency=null,method=null){
  const headers={Authorization:'Bearer '+key,'Stripe-Version':'2025-06-30.basil'};
  if(params)headers['Content-Type']='application/x-www-form-urlencoded';
  if(idempotency)headers['Idempotency-Key']=idempotency;
  const r=await request('https://api.stripe.com/v1/'+path,{method:method||(params?'POST':'GET'),headers,body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(15000)});
  const data=await r.json();if(!r.ok)throw Error('Payment service is temporarily unavailable.');return data;
 }
 async function database(path,{method='GET',body,headers={}}={}){
  const r=await request(SUPABASE_URL+'/rest/v1/'+path,{method,headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Membership update unavailable.');return r.status===204||headers.Prefer?.includes('return=minimal')?null:await r.json();
 }
 async function identity(req,allowDeleting=false){
  const token=req.headers.authorization;if(!/^Bearer \S+$/.test(token||''))throw Error('Sign in again.');
  const r=await request(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:token},signal:AbortSignal.timeout(15000)});
  const u=await r.json();if(!r.ok||!u.id)throw Error('Sign in again.');
  if(allowDeleting)return u;
  const valid=await request(SUPABASE_URL+'/rest/v1/rpc/account_active',{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
  if(!valid.ok||await valid.json()!==true)throw Error('Account unavailable.');return u;
 }
 async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>262144)throw Error('Request too large.');chunks.push(chunk);}return Buffer.concat(chunks);}
 async function sync(subscriptionId){
  // Fetch current Stripe state, rather than trusting stale or reordered event payloads.
  const sub=await stripe('subscriptions/'+encodeURIComponent(subscriptionId));
  const rows=await database('memberships?stripe_customer_id=eq.'+encodeURIComponent(sub.customer)+'&select=*');
  const member=rows[0];if(!member||sub.metadata?.fictioncom_user_id!==member.user_id)return;
  if(member.stripe_subscription_id&&member.stripe_subscription_id!==sub.id){
   const current=await stripe('subscriptions/'+encodeURIComponent(member.stripe_subscription_id));
   if(!['canceled','incomplete_expired'].includes(current.status)||['canceled','incomplete_expired'].includes(sub.status))return;
  }
  const items=sub.items?.data||[],item=items[0];
  if(items.length!==1||item.price?.id!==priceId)return;
  const until=item.current_period_end||sub.current_period_end;
  await database('memberships?user_id=eq.'+member.user_id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:{stripe_subscription_id:sub.id,subscription_status:sub.status,...(sub.trial_start&&sub.trial_end?{trial_started_at:new Date(sub.trial_start*1000).toISOString(),trial_ends_at:new Date(sub.trial_end*1000).toISOString()}:{}),paid_until:until?new Date(until*1000).toISOString():null,cancel_at_period_end:sub.cancel_at_period_end===true,updated_at:new Date().toISOString()}});
 }
 return async function billing(req,res,url){
  if(!url.pathname.startsWith('/api/billing/'))return false;
  function reply(status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true;}
  if(url.pathname==='/api/billing/config'&&req.method==='GET')return reply(200,{enabled,ready,mode,monthly_amount:0,currency:'usd',trial_days:0});
  if(url.pathname==='/api/billing/checkout')return reply(403,{error:'FictionCom is free. No payment or card is required.'});
  if(!ready)return reply(503,{error:'Subscriptions are not available yet. No payment has been taken.'});
  let lease=null,leaseUser=null;
  try{
   if(url.pathname==='/api/billing/webhook'){
    if(req.method!=='POST')return reply(405,{error:'Method not allowed.'});
    const raw=await body(req);if(!verifyStripeSignature(raw,req.headers['stripe-signature'],secret))return reply(400,{error:'Invalid signature.'});
    const event=JSON.parse(raw);if(Boolean(event.livemode)!==(mode==='live'))return reply(400,{error:'Incorrect payment environment.'});
    if(event.type.startsWith('customer.subscription.'))await sync(event.data.object.id);
    if(event.type==='checkout.session.completed'&&event.data.object.subscription)await sync(event.data.object.subscription);
    return reply(200,{received:true});
   }
   if(req.method!=='POST')return reply(405,{error:'Method not allowed.'});
   if(req.headers.origin!==origin)return reply(403,{error:'Invalid origin.'});
   const deleting=url.pathname==='/api/billing/delete-account';
   const u=await identity(req,deleting),now=Date.now(),previous=budget.get(u.id)||0;
   if(now-previous<2000)return reply(429,{error:'Please wait a moment.'});budget.set(u.id,now);
   if(budget.size>1000)for(const [id,t] of budget)if(now-t>60000)budget.delete(id);
   if(deleting){
    const data=JSON.parse(await body(req));const target=data.user_id||u.id;
    if(!/^[0-9a-f-]{36}$/i.test(target))throw Error('Account unavailable.');
    leaseUser=target;lease=await database('rpc/acquire_billing_operation',{method:'POST',body:{target,actor:u.id,operation:'delete'}});
    const member=(await database('memberships?user_id=eq.'+target+'&select=*'))[0];
    if(member?.stripe_customer_id){
     const pending=await stripe('checkout/sessions?customer='+encodeURIComponent(member.stripe_customer_id)+'&status=open&limit=100');
     for(const session of pending.data)await stripe('checkout/sessions/'+encodeURIComponent(session.id)+'/expire',{});
     const subscriptions=await stripe('subscriptions?customer='+encodeURIComponent(member.stripe_customer_id)+'&status=all&limit=100');
     for(const sub of subscriptions.data)if(!['canceled','incomplete_expired'].includes(sub.status))await stripe('subscriptions/'+encodeURIComponent(sub.id),null,null,'DELETE');
     // A customer belongs exclusively to this account; close any remaining sessions before removing its mapping.
     if(subscriptions.has_more||pending.has_more)throw Error('Membership update unavailable.');
     await database('memberships?user_id=eq.'+target,{method:'PATCH',headers:{Prefer:'return=minimal'},body:{stripe_customer_id:null,stripe_subscription_id:null,subscription_status:'canceled',paid_until:null,cancel_at_period_end:false}});
    }
    return reply(200,{ok:true});
   }
   if(url.pathname==='/api/billing/checkout'){
    leaseUser=u.id;lease=await database('rpc/acquire_billing_operation',{method:'POST',body:{target:u.id,actor:u.id,operation:'checkout'}});
   }
   let member=(await database('memberships?user_id=eq.'+u.id+'&select=*'))[0];
   if(!member&&url.pathname==='/api/billing/checkout'){await database('memberships',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:{user_id:u.id,trial_started_at:null,trial_ends_at:null}});member=(await database('memberships?user_id=eq.'+u.id+'&select=*'))[0];}
   if(!member)return reply(409,{error:'No membership to manage yet.'});
   if(url.pathname==='/api/billing/refresh'){
    if(member.stripe_subscription_id)await sync(member.stripe_subscription_id);
    else if(member.stripe_customer_id){const subscriptions=await stripe('subscriptions?customer='+encodeURIComponent(member.stripe_customer_id)+'&status=all&limit=10');const sub=subscriptions.data.find(s=>s.metadata?.fictioncom_user_id===u.id&&s.items?.data?.[0]?.price?.id===priceId);if(sub)await sync(sub.id);}
    return reply(200,{ok:true});
   }
   if(url.pathname==='/api/billing/cancel'){
    if(!member.stripe_subscription_id)return reply(409,{error:'No subscription to cancel.'});
    await stripe('subscriptions/'+encodeURIComponent(member.stripe_subscription_id),{cancel_at_period_end:'true'});await sync(member.stripe_subscription_id);return reply(200,{ok:true});
   }
   if(url.pathname==='/api/billing/portal'){
    if(!member.stripe_customer_id)return reply(409,{error:'No subscription to manage yet.'});
    const session=await stripe('billing_portal/sessions',{customer:member.stripe_customer_id,return_url:origin+'/?billing=return',...(env.STRIPE_PORTAL_CONFIGURATION_ID?{configuration:env.STRIPE_PORTAL_CONFIGURATION_ID}:{})});
    return reply(200,{url:session.url});
   }
   if(url.pathname!=='/api/billing/checkout')return reply(404,{error:'Not found.'});
   
   const price=await stripe('prices/'+encodeURIComponent(priceId));
   if(!price.active||price.unit_amount!==500||price.currency!=='usd'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1||Boolean(price.livemode)!==(mode==='live'))throw Error('Subscription price is not configured correctly.');
   if(!member.stripe_customer_id){const customer=await stripe('customers',{'metadata[fictioncom_user_id]':u.id},'fictioncom-customer-'+u.id);await database('memberships?user_id=eq.'+u.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:{stripe_customer_id:customer.id}});member={...member,stripe_customer_id:customer.id};}
   const subscriptions=await stripe('subscriptions?customer='+encodeURIComponent(member.stripe_customer_id)+'&status=all&limit=10');
   if(subscriptions.data.some(s=>['active','past_due','unpaid','incomplete','trialing','paused'].includes(s.status)))return reply(409,{error:'You already have a subscription. Use Manage subscription.'});
   const pending=await stripe('checkout/sessions?customer='+encodeURIComponent(member.stripe_customer_id)+'&status=open&limit=100');
   const existing=pending.data.find(s=>s.mode==='subscription'&&s.client_reference_id===u.id);if(existing)return reply(200,{url:existing.url});
   const trialParams=member.trial_started_at?{}:{'subscription_data[trial_period_days]':'7','subscription_data[trial_settings][end_behavior][missing_payment_method]':'cancel'};
   const session=await stripe('checkout/sessions',{...trialParams,payment_method_collection:'always','payment_method_types[0]':'card',mode:'subscription',customer:member.stripe_customer_id,client_reference_id:u.id,'line_items[0][price]':priceId,'line_items[0][quantity]':'1','subscription_data[metadata][fictioncom_user_id]':u.id,success_url:origin+'/?billing=success',cancel_url:origin+'/?billing=cancel'},'fictioncom-checkout-'+u.id+'-'+Math.floor(now/1800000));
   return reply(200,{url:session.url});
  }catch(e){console.warn(JSON.stringify({event:'billing_request_failed',at:new Date().toISOString()}));return reply(400,{error:['Sign in again.','Account unavailable.','Request too large.','Subscription price is not configured correctly.'].includes(e.message)?e.message:'Billing is temporarily unavailable. Please try again.'});}finally{if(lease)await database('rpc/release_billing_operation',{method:'POST',body:{target:leaseUser,lease_token:lease}}).catch(()=>{});}
 };
}
