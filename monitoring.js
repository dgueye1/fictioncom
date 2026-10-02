// Record categories only: never transmit captions, tokens, user data or stacks.
let lastSent=0;
function report(code){if(Date.now()-lastSent<60000)return;lastSent=Date.now();fetch('/api/client-error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),keepalive:true}).catch(()=>{});}
window.addEventListener('error',()=>report('runtime'));
window.addEventListener('unhandledrejection',()=>report('async'));
