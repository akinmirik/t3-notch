export function summarize(t) {
  const hold=(t.pendingBackgroundTasks||[]).some(x=>x.awaited||['subagent','background_task'].includes(x.kind));
  const runtime=hold&&t.status!=='failed'?'idle':(!t.latestRunId&&!t.activeProviderThreadId?null:t.activityRunStatus??t.status);
  const req=t.pendingRuntimeRequest, kind=req?.kind;
  const working=['preparing','starting','running'].includes(runtime);
  const attention=!!req&&(kind!=='user_input'&&kind!=='auth_refresh'||kind==='user_input'&&(req.blocking!==false||!working))||(t.pendingGuestMessageCount||0)>0;
  const state=attention?'attention':runtime==='running'&&t.blockedOnThreadWait?'waiting':['preparing','queued','starting','running','waiting'].includes(runtime)?'working':runtime==='idle'?'waiting':runtime==='failed'?'failed':'ready';
  return {id:t.id,title:t.title||'Untitled',projectId:t.projectId,state,runtime,completed:t.latestRunCompletedAt||null,
    hidden:!!(t.archivedAt||t.settledOverride==='settled'||t.lineage?.relationshipToParent==='subagent'||t.lineage?.sideChat)};
}
export function transition(before,after,now=Date.now()) {
  if(!before||after.hidden) return null;
  if(after.state==='attention'&&before.state!=='attention') return 'attention';
  if(after.state==='failed'&&(before.state!=='failed'||before.completed!==after.completed)) return 'failed';
  const age=now-Date.parse(after.completed);
  if(after.state==='ready'&&!['cancelled','interrupted'].includes(after.runtime)&&after.completed!==before.completed&&age>=-30000&&age<120000) return 'done';
  return null;
}
export function validSubscription(s) {
  try {
    const u=new URL(s.endpoint), host=u.hostname;
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
      (host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com')&&
      typeof s.keys?.p256dh==='string'&&/^[\w-]+$/.test(s.keys.p256dh)&&Buffer.from(s.keys.p256dh,'base64url').length===65&&
      typeof s.keys?.auth==='string'&&/^[\w-]+$/.test(s.keys.auth)&&Buffer.from(s.keys.auth,'base64url').length===16;
  } catch {return false;}
}
