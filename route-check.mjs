import {chromium, webkit} from 'playwright';
import {spawn} from 'node:child_process';

const port=process.env.ROUTE_CHECK_PORT||'4187';
const base=`http://127.0.0.1:${port}`;
const routes=[
 {path:'/',nav:'feed',tab:'feed',kind:'feed'},
 {path:'/explore',nav:'explore',tab:'foryou',kind:'explore'},
 {path:'/theories',nav:'feed',tab:'theory',kind:'feed'},
 {path:'/chapters',nav:'feed',tab:'chapters',kind:'feed'},
 {path:'/episodes',nav:'feed',tab:'episodes',kind:'feed'}
];
const viewports=[
 {name:'phone',width:390,height:844},
 {name:'laptop',width:1440,height:900}
];

function startServer(){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['serve.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let buf='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('server did not start\n'+buf));},8000);
  const onData=chunk=>{buf+=chunk.toString();if(buf.includes('listening')){clearTimeout(timer);resolve(child);}};
  child.stdout.on('data',onData);
  child.stderr.on('data',chunk=>{buf+=chunk.toString();});
  child.on('exit',code=>{if(!buf.includes('listening')){clearTimeout(timer);reject(new Error('server exited '+code+'\n'+buf));}});
 });
}

async function assertRoute(page,route,viewport){
 const wrong=route.nav==='feed'?'explore':'feed';
 const active=page.locator(`button[data-view="${route.nav}"].active`);
 if(await active.count()!==2)throw new Error(`expected 2 active ${route.nav} controls, saw ${await active.count()}`);
 if(await page.locator(`button[data-view="${wrong}"].active`).count())throw new Error(`highlighted ${wrong}`);
 if(route.kind==='explore'){
  if(await page.locator('#feed-tabs').getAttribute('hidden')===null)throw new Error('home tabs are still showing');
  if(await page.locator('[data-explore-type="foryou"]').getAttribute('aria-selected')!=='true')throw new Error('Explore For you is not selected');
  if(await page.locator('#story-strip').getAttribute('hidden')===null)throw new Error('story tray is showing on Explore');
 }else{
  for(const name of ['feed','theory','chapters','episodes']){
   const selected=await page.locator(`#feed-tabs [data-feed="${name}"]`).getAttribute('aria-selected');
   if((name===route.tab)!==(selected==='true'))throw new Error(`tab ${name} aria-selected=${selected}`);
  }
  await page.locator('#your-story').waitFor({state:'visible',timeout:8000});
 }
 if(viewport.width>=900){
  const rows=await page.locator('#rail-suggestions .suggest-row, #rail-suggestions p').count();
  if(!rows)throw new Error('Suggested for you is empty');
 }
 const card=page.locator('article.post, [data-explore-post], .empty, .explore-empty').first();
 await card.waitFor({state:'visible',timeout:8000});
 if(route.kind==='explore'){
  if(await page.locator('#feed-tabs').getAttribute('hidden')===null)throw new Error('home tabs returned after content loaded');
 }else if(await page.locator(`#feed-tabs [data-feed="${route.tab}"]`).getAttribute('aria-selected')!=='true')throw new Error('tab changed after content loaded');
 if(await page.locator(`button[data-view="${route.nav}"].active`).count()!==2)throw new Error('nav changed after content loaded');
}

async function main(){
 const server=await startServer();
 const failures=[];
 try{
  for(const browserType of [chromium,webkit]){
   const browser=await browserType.launch();
   try{
    for(const viewport of viewports){
     const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},colorScheme:'dark'});
     const page=await context.newPage();
     page.setDefaultTimeout(8000);
     for(const route of routes){
      const label=`${browserType.name()} ${viewport.name} ${route.path}`;
      try{
       await page.goto(base+route.path,{waitUntil:'domcontentloaded'});
       await assertRoute(page,route,viewport);
       console.log('ok',label);
      }catch(error){
       console.error('FAIL',label,error.message);
       failures.push(`${label}: ${error.message}`);
      }
     }
     await context.close();
    }
   }finally{await browser.close();}
  }
 }finally{server.kill('SIGTERM');}
 if(failures.length){console.error('\n'+failures.join('\n'));process.exit(1);}
 console.log('route checks passed');
}
main().catch(error=>{console.error(error);process.exit(1);});
