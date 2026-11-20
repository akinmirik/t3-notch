const CACHE='pulse-v2';
const SHELL=['/','/style.css','/app.js','/icon-192.png','/icon-512.png','/apple-touch-icon.png','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||!SHELL.includes(url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request)));
});
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 event.waitUntil(self.registration.showNotification(data.title||'Pulse',{body:data.body||'Your crew has an update.',icon:'/icon-192.png',badge:'/icon-192.png',tag:data.tag||'pulse',data:{url:safeTarget(data.url)}}));
});
function safeTarget(value){try{const url=new URL(value||'/',self.location.origin);if(url.origin===self.location.origin||url.protocol==='https:'&&url.hostname===self.location.hostname&&!url.port&&!url.username&&!url.password)return url.href;}catch{}return self.location.origin+'/';}
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=safeTarget(event.notification.data?.url);
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{for(const client of clients)if(new URL(client.url).origin===new URL(target).origin){await client.navigate(target);return client.focus();}return self.clients.openWindow(target);}));
});
