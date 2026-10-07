// Cloudflare Web Analytics beacon. The site token lives only in this file.
// Dashboard: Web Analytics → Add a site → hostname fictioncom.pages.dev → Manage site.
// Copy the token from the JS snippet and replace the placeholder below, then redeploy.
const CLOUDFLARE_WEB_ANALYTICS_TOKEN = 'REPLACE_WITH_CF_ANALYTICS_TOKEN';
const beacon = document.createElement('script');
beacon.type = 'module';
beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
beacon.setAttribute('data-cf-beacon', JSON.stringify({token: CLOUDFLARE_WEB_ANALYTICS_TOKEN}));
document.head.appendChild(beacon);
