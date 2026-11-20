import test from 'node:test';import assert from 'node:assert/strict';
import {summarize,transition,validSubscription} from './events.mjs';
import {defaultQuiet,validQuiet,isQuiet,shouldDefer,threadUrl,validateJob} from './features.mjs';
import fs from 'node:fs';import vm from 'node:vm';
const base={id:'a',title:'Test',status:'running',latestRunId:'run'};
test('working, attention, waiting and hidden threads',()=>{
 assert.equal(summarize(base).state,'working');
 assert.equal(summarize({...base,pendingRuntimeRequest:{kind:'user_input'}}).state,'attention');
 assert.equal(summarize({...base,pendingBackgroundTasks:[{awaited:true}]}).state,'waiting');
 assert.equal(summarize({...base,archivedAt:'2026-11-20'}).hidden,true);
});
test('completion once, baseline and stale/cancelled runs silent',()=>{
 const before=summarize(base),now=Date.now(),after=summarize({...base,status:'completed',latestRunCompletedAt:new Date(now).toISOString()});
 assert.equal(transition(before,after,now),'done');assert.equal(transition(after,after,now),null);assert.equal(transition(undefined,after,now),null);
 assert.equal(transition(before,after,now+130000),null);assert.equal(transition(before,{...after,runtime:'interrupted'},now),null);
});
test('attention and failure transitions',()=>{
 const before=summarize(base),attention=summarize({...base,pendingRuntimeRequest:{kind:'approval'}}),failed=summarize({...base,status:'failed'});
 assert.equal(transition(before,attention),'attention');assert.equal(transition(attention,attention),null);assert.equal(transition(before,failed),'failed');
});
test('push endpoints cannot target local or arbitrary services',()=>{
 const keys={p256dh:Buffer.alloc(65).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')};
 assert.equal(validSubscription({endpoint:'https://web.push.apple.com/test',keys}),true);
 for(const endpoint of ['http://web.push.apple.com/test','https://127.0.0.1/test','https://evil.push.apple.com.evil.test/test','https://web.push.apple.com:8443/test','https://user@web.push.apple.com/test'])assert.equal(validSubscription({endpoint,keys}),false);
 assert.equal(validSubscription({endpoint:'https://web.push.apple.com/test',keys:{auth:'x',p256dh:'x'}}),false);
});
test('quiet hours use Istanbul time and exact boundaries',()=>{
 assert.equal(isQuiet(defaultQuiet,new Date('2026-11-20T20:59:59Z')),false);
 assert.equal(isQuiet(defaultQuiet,new Date('2026-11-20T21:00:00Z')),true);
 assert.equal(isQuiet(defaultQuiet,new Date('2026-11-21T04:59:59Z')),true);
 assert.equal(isQuiet(defaultQuiet,new Date('2026-11-21T05:00:00Z')),false);
 assert.equal(isQuiet({...defaultQuiet,start:'23:00',end:'07:00'},new Date('2026-11-20T20:30:00Z')),true);
 assert.equal(isQuiet({...defaultQuiet,enabled:false},new Date('2026-11-20T23:00:00Z')),false);
});
test('errors, questions and explicit tests bypass quiet hours',()=>{
 const now=new Date('2026-11-20T23:00:00Z');
 assert.equal(shouldDefer('done',defaultQuiet,now),true);
 for(const kind of ['attention','failed','test'])assert.equal(shouldDefer(kind,defaultQuiet,now),false);
 assert.equal(validQuiet({...defaultQuiet,start:'25:00'}),false);
 assert.equal(validQuiet({...defaultQuiet,start:'08:00'}),false);
});
test('thread URLs are encoded and require known environment',()=>{
 assert.equal(threadUrl('https://host.example','env','thread'), 'https://app.t3.codes/threads/env/thread');
 assert.equal(threadUrl('https://host.example','env','a/b'),'https://app.t3.codes/threads/env/a%2Fb');
 assert.equal(threadUrl('https://host.example',null,'thread'),null);
});
test('Blender job envelopes validate kind, bounded title and timestamp',()=>{
 const job={id:'12345678-1234-1234-1234-123456789abc',kind:'render_complete',title:'Product',time:new Date().toISOString()};
 assert.equal(validateJob(job),true);
 assert.equal(validateJob({...job,kind:'execute'}),false);
 assert.equal(validateJob({...job,title:'a'.repeat(121)}),false);
 assert.equal(validateJob({...job,time:'no'}),false);
});
test('notification click opens its conversation instead of focusing the home screen',async()=>{
 const handlers={},opened=[];let waited;
 const target='https://akin-host.tail13abb4.ts.net/env/thread';
 const self={location:{origin:'https://akin-host.tail13abb4.ts.net:8443',hostname:'akin-host.tail13abb4.ts.net'},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync(new URL('./public/sw.js',import.meta.url),'utf8'),{self,URL});
 handlers.notificationclick({notification:{data:{url:target},close(){}},waitUntil:p=>waited=p});await waited;
 assert.deepEqual(opened,['https://app.t3.codes/threads/env/thread']);
 handlers.notificationclick({notification:{data:{url:'https://untrusted.example/'},close(){}},waitUntil:p=>waited=p});await waited;
 assert.equal(opened[1],self.location.origin+'/');
 handlers.notificationclick({notification:{data:{url:'https://app.t3.codes/threads/env/thread'},close(){}},waitUntil:p=>waited=p});await waited;
 assert.equal(opened[2],'https://app.t3.codes/threads/env/thread');
 handlers.notificationclick({notification:{data:{url:'https://app.t3.codes/other'},close(){}},waitUntil:p=>waited=p});await waited;
 assert.equal(opened[3],self.location.origin+'/');
});
