import test from 'node:test';import assert from 'node:assert/strict';
import {summarize,transition,validSubscription} from './events.mjs';
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
