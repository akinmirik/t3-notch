const $=id=>document.getElementById(id);
let device=localStorage.getItem('pulse-device');if(!device){device=crypto.randomUUID();localStorage.setItem('pulse-device',device);}
let registration,state,muted=false;
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const notice=text=>$('notice').textContent=text;
async function api(route,body){const r=await fetch('/api/'+route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device,...body})}:{});const data=await r.json();if(!r.ok)throw Error(data.error||'Connection unavailable');return data;}
function enabled(on){$('permission').textContent=on?'Connected':'Not connected';$('enable').textContent=on?'Notifications enabled':'Enable notifications';$('enable').disabled=on;$('test').disabled=!on;$('mute').disabled=!on;$('disconnect').hidden=!on;}
function draw(){
 const online=state.sources.filter(s=>s.connected).length;$('connection').textContent=online?`${online} source connected`:'Reconnecting';$('connection').classList.toggle('live',online>0);
 const priority={attention:0,failed:1,working:2,waiting:3,ready:4};const threads=state.threads.sort((a,b)=>priority[a.state]-priority[b.state]||Date.parse(b.completed||0)-Date.parse(a.completed||0));
 $('count').textContent=`${threads.filter(t=>t.state==='working').length} working`;$('threads').replaceChildren();
 for(const t of threads.slice(0,12)){const row=document.createElement(t.url?'a':'div');row.className='thread';if(t.url)row.href=t.url;const icon=document.createElement('img');icon.src='/icon-192.png';icon.className='mini-pet';icon.alt='';const info=document.createElement('div');info.className='thread-info';const title=document.createElement('div');title.className='thread-title';title.textContent=t.title;const sub=document.createElement('div');sub.className='thread-sub';sub.textContent=[t.project,t.source].filter(Boolean).join(' · ');info.append(title,sub);const status=document.createElement('span');status.className='state '+t.state;status.textContent={working:'Working',attention:'Needs you',failed:'Error',waiting:'Waiting',ready:'Ready'}[t.state];row.append(icon,info,status);$('threads').append(row);}
 if(!threads.length)$('threads').textContent='Your crew is quiet right now.';
 if(state.events.length){$('events').replaceChildren();for(const item of state.events.slice(0,8)){const row=document.createElement(item.url&&item.threadId?'a':'div');row.className='event';if(item.url&&item.threadId)row.href=item.url;const title=document.createElement('b');title.textContent=item.title;const body=document.createElement('p');body.textContent=item.body;const time=document.createElement('time');time.textContent=new Date(item.time).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});row.append(title,body,time);$('events').append(row);}}
}
async function refresh(){try{state=await api('state');draw();}catch{ $('connection').textContent='Offline';$('connection').classList.remove('live');notice('Connect to your personal Tailscale network to refresh Pulse. Notifications use your internet connection.');}}
async function syncSubscription(){const subscription=await registration.pushManager.getSubscription();if(subscription){const result=await api('subscribe',{subscription:subscription.toJSON()});muted=result.muted;setQuiet(result.quiet);$('mute').textContent=muted?'Resume alerts':'Pause alerts';enabled(true);}else enabled(false);}
$('enable').onclick=async()=>{try{
 if(ios&&!standalone){$('install').hidden=false;notice('Add Pulse to your Home Screen, then open it from there.');return;}
 if(!registration||!state)throw Error('Still connecting. Please try again in a moment.');
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Allow Pulse notifications in your device settings, then try again.');
 const key=Uint8Array.from(atob(state.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 const result=await api('subscribe',{subscription:subscription.toJSON()});setQuiet(result.quiet);enabled(true);notice('You’re connected. Tap Send a test to meet your crew.');
 }catch(e){notice(e.message);}};
$('test').onclick=async()=>{try{$('test').disabled=true;await api('test',{});notice('Test sent. Look for a Pulse notification.');}catch(e){notice(e.message);}finally{$('test').disabled=false;}};
$('mute').onclick=async()=>{try{await api('mute',{muted:!muted});muted=!muted;$('mute').textContent=muted?'Resume alerts':'Pause alerts';notice(muted?'Alerts paused on this device.':'Your crew can nudge you again.');}catch(e){notice(e.message);}};
$('disconnect').onclick=async()=>{try{await api('unsubscribe',{});const sub=await registration.pushManager.getSubscription();if(sub)await sub.unsubscribe();enabled(false);notice('This device is disconnected.');}catch(e){notice(e.message);}};
(async()=>{await refresh();if(ios&&!standalone){$('install').hidden=false;$('enable').textContent='How to install Pulse';return;}
 if(!('serviceWorker'in navigator)||!('PushManager'in window)){notice('Open Pulse in a browser that supports web notifications.');return;}
 try{registration=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;await syncSubscription();}catch(e){notice(e.message);}})();
setInterval(()=>{if(!document.hidden)void refresh();},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});

function setQuiet(q){if(!q)return;$('quietEnabled').checked=q.enabled;$('quietStart').value=q.start;$('quietEnd').value=q.end;}
$('saveQuiet').onclick=async()=>{try{await api('preferences',{quiet:{enabled:$('quietEnabled').checked,start:$('quietStart').value,end:$('quietEnd').value,timeZone:'Europe/Istanbul'}});$('quietNotice').textContent='Saved for this phone.';}catch(e){$('quietNotice').textContent=e.message;}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&registration)void registration.update();});