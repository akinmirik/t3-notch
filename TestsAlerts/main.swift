import Foundation

func row(_ status:String, completion:String? = nil, request:Bool=false) -> AgentThread {
    var json:[String:Any] = ["id":"chat","projectId":"p","title":"Test","status":status,"latestRunId":"r","lastVisitedAt":"2020-01-01T00:00:00Z"]
    if let completion { json["latestRunCompletedAt"]=completion }
    if request { json["pendingRuntimeRequest"]=["kind":"user_input","blocking":true] }
    return AgentThread(json)!
}
var tracker=AlertTracker()
let now=ISO8601DateFormatter().string(from:Date())
let run=row("running"), done=row("completed",completion:now), wait=row("running",request:true)
assert(tracker.ingest([done],baseline:true,source:0).isEmpty)
assert(tracker.ingest([run],baseline:false,source:0).isEmpty)
assert(tracker.ingest([done],baseline:false,source:0).map(\.1)==["done"])
assert(tracker.ingest([done],baseline:false,source:0).isEmpty)
assert(tracker.ingest([wait],baseline:false,source:0).map(\.1)==["wait"])
assert(tracker.ingest([wait],baseline:false,source:0).isEmpty)
assert(tracker.ingest([row("failed",completion:now)],baseline:false,source:0).map(\.1)==["error"])
assert(tracker.ingest([done],baseline:true,source:0).isEmpty)
assert(tracker.ingest([done],baseline:false,source:1).isEmpty)
assert(tracker.ingest([row("interrupted",completion:now)],baseline:false,source:0).isEmpty)
assert(tracker.ingest([row("completed",completion:"2020-01-01T00:00:00Z")],baseline:false,source:0).isEmpty)
print("alert tests passed: first snapshot, completion, duplicate, attention, error, reconnect, source isolation, interrupted, stale")
