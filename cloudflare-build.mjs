import {mkdir,readdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const dest=path.join(root,'cloudflare-public');await mkdir(dest,{recursive:true});
// Copy only public browser assets, never SQL, server code, environment files or credentials.
for(const name of await readdir(root))if(/\.(html|css|svg|gif|js)$/.test(name))await copyFile(path.join(root,name),path.join(dest,name));
await writeFile(path.join(dest,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: geolocation=()\n');
