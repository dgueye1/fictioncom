import './cloudflare-build.mjs';
import {readFile,writeFile} from 'node:fs/promises';
// This configuration is generated only in the Pages build checkout.
await writeFile(new URL('./wrangler.jsonc',import.meta.url),JSON.stringify({name:'fictioncom',pages_build_output_dir:'./cloudflare-public',compatibility_date:'2026-10-02',compatibility_flags:['nodejs_compat']}));
const worker=await readFile(new URL('./cloudflare-worker.mjs',import.meta.url),'utf8');
await writeFile(new URL('./cloudflare-pages-entry.mjs',import.meta.url),worker.replace("return new Response('Not found',{status:404});","return env.ASSETS.fetch(request);"));
await writeFile(new URL('./cloudflare-public/_routes.json',import.meta.url),JSON.stringify({version:1,include:['/api/*','/healthz'],exclude:[]}));
