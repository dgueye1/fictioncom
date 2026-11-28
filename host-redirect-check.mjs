import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium, webkit} from 'playwright';
import worker, {legacyPagesRedirect} from './cloudflare-worker.mjs';
import {applyOpenGraph} from './og.mjs';

function locationOf(from){
  const response=legacyPagesRedirect(new URL(from));
  assert.ok(response, from);
  assert.equal(response.status, 301);
  const location=response.headers.get('location');
  assert.equal(new URL(location).hash, '');
  assert.equal(location.includes('#'), false);
  return location;
}

assert.equal(locationOf('https://fictioncom.pages.dev/'), 'https://fictioncom.com/');
assert.equal(locationOf('https://fictioncom.pages.dev/?code=abc&state=ok'), 'https://fictioncom.com/?code=abc&state=ok');
assert.equal(locationOf('https://FictionCom.pages.dev/write'), 'https://fictioncom.com/write');
assert.equal(locationOf('https://fictioncom.pages.dev:443/privacy?code=abc'), 'https://fictioncom.com/privacy?code=abc');
assert.equal(locationOf('https://fictioncom.pages.dev/p/11111111-1111-1111-1111-111111111111?code=abc'), 'https://fictioncom.com/p/11111111-1111-1111-1111-111111111111?code=abc');
assert.equal(new URL(locationOf('https://fictioncom.pages.dev//evil.com?code=abc')).hostname, 'fictioncom.com');

for(const host of [
  'https://feat.fictioncom.pages.dev/?code=abc',
  'https://6b2d0147.fictioncom.pages.dev/',
  'https://fictioncom.com/?code=abc',
  'https://www.fictioncom.com/',
  'https://fictioncom.pages.dev.evil.example/',
  'https://notfictioncom.pages.dev/'
])assert.equal(legacyPagesRedirect(new URL(host)), null, host);

const hashed=await worker.fetch(new Request('https://fictioncom.pages.dev/return?code=abc#access_token=secret'), {});
assert.equal(hashed.status, 301);
assert.equal(hashed.headers.get('location'), 'https://fictioncom.com/return?code=abc');

const post=await worker.fetch(new Request('https://fictioncom.pages.dev/api/alerts/drain', {method:'POST'}), {});
assert.equal(post.status, 301);
assert.equal(post.headers.get('location'), 'https://fictioncom.com/api/alerts/drain');

const assets={ASSETS:{async fetch(){return new Response('<!doctype html><html><head><title>FictionCom</title></head><body></body></html>', {status:200, headers:{'content-type':'text/html'}});}}};
const preview=await worker.fetch(new Request('https://feat.fictioncom.pages.dev/explore?code=abc'), assets);
assert.notEqual(preview.status, 301);
const canonical=await worker.fetch(new Request('https://fictioncom.com/explore'), assets);
assert.equal(canonical.status, 200);
assert.match(await canonical.text(), /fictioncom\.com\/explore/);

const html=await readFile(new URL('./index.html', import.meta.url), 'utf8');
const tags=await applyOpenGraph(html, new URL('https://fictioncom.com/explore?tab=1'), {});
assert.match(tags, /property="og:url" content="https:\/\/fictioncom.com\/explore\?tab=1"/);
assert.match(tags, /property="og:image" content="https:\/\/fictioncom.com\/og-image.png"/);
assert.match(tags, /rel="canonical" href="https:\/\/fictioncom.com\/explore\?tab=1"/);
assert.doesNotMatch(tags, /pages\.dev/);

for(const name of ['index.html','write.html','privacy.html','terms.html','launch-setup.html','robots.txt','sitemap.xml','email-alerts.mjs','analytics.js','site.webmanifest']){
  const text=await readFile(new URL('./'+name, import.meta.url), 'utf8');
  assert.doesNotMatch(text, /fictioncom\.pages\.dev/, name);
}
assert.match(await readFile(new URL('./email-alerts.mjs', import.meta.url), 'utf8'), /https:\/\/fictioncom\.com\//);
assert.match(await readFile(new URL('./cloudflare-pages-build.mjs', import.meta.url), 'utf8'), /include:\['\/','\/\*'\]/);
assert.match(await readFile(new URL('./wrangler.jsonc', import.meta.url), 'utf8'), /"run_worker_first":true/);
assert.doesNotMatch(await readFile(new URL('./cloudflare-worker.mjs', import.meta.url), 'utf8'), /https:\/\/fictioncom\.pages\.dev/);

const seen=[];
const server=http.createServer((req, res)=>{
  const incoming=new URL(req.url, 'http://127.0.0.1');
  seen.push(incoming.pathname+incoming.search);
  assert.equal(incoming.hash, '');
  assert.equal(incoming.href.includes('access_token'), false);
  if(incoming.pathname.startsWith('/landed')){
    res.writeHead(200, {'content-type':'text/html; charset=utf-8'});
    res.end('<!doctype html><title>landed</title>');
    return;
  }
  const redirect=legacyPagesRedirect(new URL(incoming.pathname+incoming.search, 'https://fictioncom.pages.dev'));
  const location=new URL(redirect.headers.get('location'));
  assert.equal(location.origin, 'https://fictioncom.com');
  assert.equal(location.hash, '');
  res.writeHead(301, {Location:`http://127.0.0.1:${server.address().port}/landed${location.pathname}${location.search}`});
  res.end();
});
await new Promise(resolve=>server.listen(0, '127.0.0.1', resolve));
const port=server.address().port;
const base=`http://127.0.0.1:${port}`;

try{
  for(const browserType of [chromium, webkit]){
    const browser=await browserType.launch();
    try{
      const page=await browser.newPage();
      await page.goto(base+'/return?code=oauth-code#access_token=hash-token', {waitUntil:'domcontentloaded'});
      const both=new URL(page.url());
      assert.equal(both.pathname, '/landed/return', browserType.name());
      assert.equal(both.search, '?code=oauth-code', browserType.name());
      assert.equal(both.hash, '#access_token=hash-token', browserType.name());
      await page.goto(base+'/#access_token=only-hash', {waitUntil:'domcontentloaded'});
      const onlyHash=new URL(page.url());
      assert.equal(onlyHash.pathname, '/landed/', browserType.name());
      assert.equal(onlyHash.search, '', browserType.name());
      assert.equal(onlyHash.hash, '#access_token=only-hash', browserType.name());
      console.log('ok', browserType.name(), 'kept hash across 301');
    }finally{await browser.close();}
  }
}finally{server.close();}

assert.ok(seen.length>=4);
for(const url of seen)assert.equal(url.includes('access_token')||url.includes('#'), false, url);
console.log('host redirect checks passed');
