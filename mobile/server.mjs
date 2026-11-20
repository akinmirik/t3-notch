import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import webpush from 'web-push';
import WebSocket from 'ws';
import {summarize,transition,validSubscription} from './events.mjs';
import {defaultQuiet,validQuiet,isQuiet,shouldDefer,threadUrl,validateJob} from './features.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.PULSE_DATA||path.join(process.env.LOCALAPPDATA,'akin-host','pulse-pocket');
const cfg=JSON.parse(fs.readFileSync(path.join(data,'config.json'),'utf8'));
const statePath=path.join(data,'state.json');
let saved={subscriptions:{},events:[]};
if(fs.existsSync(statePath)) saved=JSON.parse(fs.readFileSync(statePath,'utf8'));
function persist(){const tmp=statePath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(saved),{mode:0o600});fs.renameSync(tmp,statePath);}
webpush.setVapidDetails(cfg.origin,cfg.vapid.publicKey,cfg.vapid.privateKey);
const sources=cfg.sources.map(s=>({...s,connected:false,threads:new Map(),projects:new Map(),backoff:1000}));
const log=(message)=>console.log(new Date().toISOString(),message);
const digestBusy=new Set();
async function sendTo(device,payload,{immediate=false}={}){
  const entry=saved.subscriptions[device]; if(!entry||entry.muted) return false;
  if(!immediate&&shouldDefer(payload.kind,entry.quiet||defaultQuiet)){
    entry.pending=entry.pending||[];entry.pending.push({id:payload.id||randomUUID(),title:payload.title,time:new Date().toISOString()});entry.pending=entry.pending.slice(-100);persist();return true;
  }
  try{await webpush.sendNotification(entry.subscription,JSON.stringify(payload),{TTL:300,urgency:'normal',timeout:10000});entry.lastSent=new Date().toISOString();entry.error=null;persist();log('Push accepted by provider');return true;}
  catch(e){const status=e.statusCode||0;entry.error=status||'network';if([404,410].includes(status))delete saved.subscriptions[device];persist();log(`Push delivery failed (${status||'network'})`);return false;}
}
function publish(source,row,kind){
  const event={id:randomUUID(),title:row.title.slice(0,120),body:kind==='attention'?'Your agent needs you.':kind==='failed'?'This run hit an error.':'Your reply is ready.',kind,source:source.name,time:new Date().toISOString(),threadId:row.id,url:threadUrl(source.publicUrl,source.environment,row.id)||'/'};
  saved.events.unshift(event);saved.events=saved.events.slice(0,50);persist();
  const payload={...event,tag:`${source.name}/${row.id}`};
  for(const device of Object.keys(saved.subscriptions)) void sendTo(device,payload);
}
async function flushDigests(){
 for(const [device,entry]of Object.entries(saved.subscriptions)){
  if(entry.muted||!entry.pending?.length||isQuiet(entry.quiet||defaultQuiet)||digestBusy.has(device))continue;
  digestBusy.add(device);const batch=entry.pending.slice(),ids=new Set(batch.map(x=>x.id));
  try{if(await sendTo(device,{title:'Your crew’s recap',body:`${batch.length} ${batch.length===1?'update was':'updates were'} waiting while you rested. Open Pulse to catch up.`,kind:'digest',url:'/',tag:'pulse-quiet-recap'},{immediate:true})){entry.pending=entry.pending.filter(x=>!ids.has(x.id));persist();}}
  finally{digestBusy.delete(device);}
 }
}
const spool=path.join(data,'jobs');fs.mkdirSync(spool,{recursive:true});
function consumeJobs(){
 for(const name of fs.readdirSync(spool).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).slice(0,50)){
  const file=path.join(spool,name);
  try{
   if(fs.statSync(file).size>4096){fs.renameSync(file,file+'.rejected');continue;}
   const job=JSON.parse(fs.readFileSync(file,'utf8'));
   if(!validateJob(job)){fs.renameSync(file,file+'.rejected');continue;}
   saved.jobIds=saved.jobIds||[];
   if(!saved.jobIds.includes(job.id)){
    const failed=['render_cancel','export_failed'].includes(job.kind);
    const event={id:job.id,title:job.title,body:job.kind==='render_cancel'?'Blender render was cancelled.':job.kind==='export_failed'?'Blender export failed.':job.kind==='export_complete'?'Blender export is ready.':'Blender render is ready.',kind:failed?'failed':'done',source:'Blender',time:job.time,url:'/#activity'};
    saved.jobIds.push(job.id);saved.jobIds=saved.jobIds.slice(-2000);saved.events.unshift(event);saved.events=saved.events.slice(0,50);persist();
    for(const device of Object.keys(saved.subscriptions))void sendTo(device,{...event,tag:'blender-'+job.id});
    log('Blender job received: '+job.kind);
   }
   fs.unlinkSync(file);
  }catch{log('Could not process Blender job');}
 }
}
setInterval(()=>void flushDigests(),30000);
setInterval(consumeJobs,2000);
function connect(source){
  if(!source.environment)fetch(new URL('/.well-known/t3/environment',source.url),{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).then(v=>{source.environment=v.environmentId;}).catch(()=>{});
  source.publicUrl=source.publicUrl||new URL(cfg.origin).origin.replace(/:8443$/,'');
  const url=new URL('/ws?orchestrationProtocol=2',source.url);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(url,{headers:{Authorization:`Bearer ${source.token}`},maxPayload:64*1024*1024,handshakeTimeout:10000});
  let first=true,lastPong=Date.now();source.connected=false;
  const send=value=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));};
  const heartbeat=setInterval(()=>{if(Date.now()-lastPong>60000)ws.terminate();else send({_tag:'Ping'});},20000);
  ws.on('open',()=>send({_tag:'Request',id:'1',tag:'orchestration.subscribeShell',payload:{omitIdleSubagents:true,omitOlderSettled:true},headers:[]}));
  ws.on('message',raw=>{
    try{
      const parsed=JSON.parse(raw);for(const m of Array.isArray(parsed)?parsed:[parsed]){
        if(m._tag==='Pong')lastPong=Date.now();
        if(m._tag==='Ping')send({_tag:'Pong'});
        if(['Exit','Defect','ClientProtocolError'].includes(m._tag))ws.close();
        if(m._tag!=='Chunk')continue;
        if(!source.connected)log(`${source.name} connected`);source.connected=true;source.backoff=1000;
        for(const item of m.values||[]){
          if(item.kind==='snapshot'){
            const snap=item.snapshot||{};
            if(first||(snap.threads||[]).length){source.threads=new Map((snap.threads||[]).map(t=>[t.id,summarize(t)]));first=false;}
            for(const p of snap.projects||[])source.projects.set(p.id,p.title);
          }
          if(item.kind==='thread.updated'&&item.thread){
            const t=item.thread;if(item.location!=='active'){source.threads.delete(t.id);continue;}
            const row=summarize(t),old=source.threads.get(t.id);source.threads.set(t.id,row);
            if(!first){const kind=transition(old,row);if(kind)publish(source,row,kind);}
          }
          if(item.kind==='thread.removed')source.threads.delete(item.threadId);
          if(item.kind==='project.updated'&&item.project)source.projects.set(item.project.id,item.project.title);
        }
        send({_tag:'Ack',requestId:m.requestId||'1'});
      }
    }catch{log('Ignored malformed stream message');}
  });
  ws.on('error',()=>{});
  ws.on('close',()=>{clearInterval(heartbeat);source.connected=false;setTimeout(()=>connect(source),source.backoff);source.backoff=Math.min(source.backoff*2,30000);});
}
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/sw.js':['sw.js','text/javascript'],'/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'],'/icon-192.png':['icon-192.png','image/png'],'/icon-512.png':['icon-512.png','image/png'],'/apple-touch-icon.png':['apple-touch-icon.png','image/png']};
const lastTest=new Map();
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/healthz'){reply(200,{ok:true,connected:sources.filter(s=>s.connected).length,subscriptions:Object.keys(saved.subscriptions).length});return;}
  // Only Serve may reach this loopback service; identity is injected by Serve, never by the UI.
  if(req.headers['tailscale-user-login']!==cfg.allowedUser){reply(403,{error:'Connect through your personal Tailscale network.'});return;}
  if(req.method==='GET'&&files[url.pathname]){
    const [file,type]=files[url.pathname];res.writeHead(200,{'Content-Type':type});fs.createReadStream(path.join(root,'public',file)).pipe(res);return;
  }
  if(req.method==='GET'&&url.pathname==='/api/state'){
    reply(200,{publicKey:cfg.vapid.publicKey,sources:sources.map(s=>({name:s.name,connected:s.connected})),
      threads:sources.flatMap(s=>[...s.threads.values()].filter(t=>!t.hidden).map(t=>({id:t.id,title:t.title,state:t.state,source:s.name,project:s.projects.get(t.projectId)||'',completed:t.completed,url:threadUrl(s.publicUrl,s.environment,t.id)}))),events:saved.events,quietDefaults:defaultQuiet});return;
  }
  if(req.method!=='POST'||!['/api/subscribe','/api/test','/api/mute','/api/unsubscribe','/api/preferences'].includes(url.pathname)){reply(404,{error:'Not found'});return;}
  if(req.headers.origin!==cfg.origin||!String(req.headers['content-type']).startsWith('application/json')){reply(403,{error:'Invalid request origin'});return;}
  try{
    let text='';for await(const chunk of req){text+=chunk;if(text.length>12000){reply(413,{error:'Request too large'});return;}}
    const body=JSON.parse(text),device=body.device;
    if(typeof device!=='string'||!/^[-\w]{20,80}$/.test(device)){reply(400,{error:'Invalid device'});return;}
    if(url.pathname==='/api/subscribe'){
      if(!validSubscription(body.subscription)){reply(400,{error:'Unsupported push subscription'});return;}
      if(!saved.subscriptions[device]&&Object.keys(saved.subscriptions).length>=10){reply(409,{error:'Device limit reached'});return;}
      saved.subscriptions[device]={...saved.subscriptions[device],subscription:body.subscription,muted:!!saved.subscriptions[device]?.muted,added:saved.subscriptions[device]?.added||new Date().toISOString()};persist();reply(200,{ok:true,muted:saved.subscriptions[device].muted,quiet:saved.subscriptions[device].quiet||defaultQuiet});return;
    }
    if(!saved.subscriptions[device]){reply(404,{error:'Enable notifications on this device first.'});return;}
    if(url.pathname==='/api/preferences'){
      if(body.quiet!==undefined){if(!validQuiet(body.quiet)){reply(400,{error:'Choose different start and end times.'});return;}saved.subscriptions[device].quiet=body.quiet;persist();void flushDigests();}
      reply(200,{quiet:saved.subscriptions[device].quiet||defaultQuiet,pending:saved.subscriptions[device].pending?.length||0});return;
    }
    if(url.pathname==='/api/unsubscribe'){delete saved.subscriptions[device];persist();reply(200,{ok:true});return;}
    if(url.pathname==='/api/mute'){saved.subscriptions[device].muted=body.muted===true;persist();reply(200,{ok:true});return;}
    if(Date.now()-(lastTest.get(device)||0)<10000){reply(429,{error:'Please wait a few seconds.'});return;}
    lastTest.set(device,Date.now());
    let payload={title:'Pulse',body:'Your crew is connected. A little peace of mind.',kind:'test',url:'/',tag:'pulse-test'};
    if(body.threadId){
      const source=sources.find(s=>s.threads.has(body.threadId));
      if(!source?.environment){reply(400,{error:'Conversation is not available.'});return;}
      payload={...payload,title:source.threads.get(body.threadId).title,body:'Tap to open this chat in the T3 Code app.',url:threadUrl(source.publicUrl,source.environment,body.threadId)};
    }
    const ok=await sendTo(device,payload);reply(ok?200:502,{ok,error:ok?undefined:'Push was not accepted. Check pause setting and try enabling again.'});
  }catch{reply(400,{error:'Could not complete request'});}
});
server.listen(cfg.port,'127.0.0.1',()=>log(`Pulse listening on loopback:${cfg.port}`));
for(const s of sources)connect(s);
