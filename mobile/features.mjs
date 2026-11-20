export const defaultQuiet={enabled:true,start:'00:00',end:'08:00',timeZone:'Europe/Istanbul'};
const validTime=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
export function validQuiet(q){return q&&typeof q.enabled==='boolean'&&validTime(q.start)&&validTime(q.end)&&q.start!==q.end&&q.timeZone==='Europe/Istanbul';}
export function isQuiet(q=defaultQuiet,now=new Date()){
 if(!q.enabled)return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:q.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const clock=parts.find(x=>x.type==='hour').value+':'+parts.find(x=>x.type==='minute').value;
 return q.start<q.end?clock>=q.start&&clock<q.end:clock>=q.start||clock<q.end;
}
export const shouldDefer=(kind,q,now)=>!['attention','failed','test'].includes(kind)&&isQuiet(q,now);
export function threadUrl(origin,environment,id){
 if(!environment||!id)return null;
 const url=new URL(origin);if(!['https:','http:'].includes(url.protocol))return null;
 url.pathname='/'+encodeURIComponent(environment)+'/'+encodeURIComponent(id);url.search='';url.hash='';return url.href;
}
export function validateJob(value){
 return value&&typeof value.id==='string'&&/^[a-f0-9-]{36}$/.test(value.id)&&['render_complete','render_cancel','export_complete','export_failed'].includes(value.kind)&&typeof value.title==='string'&&value.title.length>0&&value.title.length<=120&&Number.isFinite(Date.parse(value.time));
}
