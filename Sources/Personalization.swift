import AppKit
import SwiftUI
import UserNotifications

@MainActor
final class Preferences: ObservableObject {
    static let shared = Preferences()
    let defaults = UserDefaults.standard
    @Published var muted: Bool { didSet { defaults.set(muted, forKey:"muted") } }
    @Published var volume: Double { didSet { defaults.set(volume, forKey:"volume") } }
    @Published var sounds: [String:String] { didSet { defaults.set(sounds, forKey:"sounds") } }
    @Published var notice = ""
    private var player: NSSound?
    private var window: NSWindow?
    init() {
        let old = UserDefaults(suiteName:"local.akin.Pulse")!
        let migrated = defaults.bool(forKey:"pulseMigrated")
        let source = migrated ? defaults : old
        muted = source.bool(forKey:"muted")
        volume = source.object(forKey:"volume") as? Double ?? 0.35
        let saved = source.dictionary(forKey:"sounds") as? [String:String] ?? [:]
        sounds = Dictionary(saved.map { key, value in
            let newKey = migrated ? key : key.replacingOccurrences(of:":",with:"/",range:key.range(of:":"))
            return (newKey, value == "Sessiz" ? "Silent" : value)
        }, uniquingKeysWith:{ _,b in b })
        defaults.set(muted,forKey:"muted"); defaults.set(volume,forKey:"volume")
        defaults.set(sounds,forKey:"sounds"); defaults.set(true,forKey:"pulseMigrated")
    }
    func sound(for key:String) -> String { sounds[key] ?? "Glass" }
    func play(_ name:String, event:String = "done") {
        guard name != "Silent", let url = Bundle.main.resourceURL?.appendingPathComponent("\(name)-\(event).wav") else { return }
        player?.stop(); player = NSSound(contentsOf:url,byReference:true)
        player?.volume = Float(volume); player?.play()
    }
    func permissions() {
        UNUserNotificationCenter.current().requestAuthorization(options:[.alert,.sound]) { granted,_ in
            Task { @MainActor in self.notice = granted ? "Notifications enabled" : "Allow notifications in System Settings → Notifications → Pulse Notch." }
        }
    }
    func showSettings() {
        if window == nil {
            let w = NSWindow(contentRect:NSRect(x:0,y:0,width:380,height:270),styleMask:[.titled,.closable],backing:.buffered,defer:false)
            w.title = "Pulse Notch · Settings"; w.isReleasedWhenClosed = false
            w.contentView = NSHostingView(rootView:PreferencesView(preferences:self))
            w.center(); window = w
        }
        NSApp.activate(ignoringOtherApps:true); window?.makeKeyAndOrderFront(nil)
    }
}

struct PreferencesView: View {
    @ObservedObject var preferences: Preferences
    var body: some View {
        VStack(alignment:.leading,spacing:16) {
            Text("Little sounds. Clear signals.").font(.headline)
            Toggle("Mute sounds and notifications",isOn:$preferences.muted)
            HStack { Text("Volume"); Slider(value:$preferences.volume,in:0...1) }
            HStack { ForEach(["Glass","Wood","Air"],id:\.self) { sound in Button(sound) { preferences.play(sound) } } }
            Button("Enable macOS notifications") { preferences.permissions() }
            Text(preferences.notice.isEmpty ? "Choose a sound for each chat using its music-note menu. Pulse Notch starts at login." : preferences.notice).font(.caption).foregroundStyle(.secondary)
        }.padding(22).frame(width:380,height:270)
    }
}

// Pure transition policy. First snapshots after launch/wake/reconnect are silent.
struct AlertTracker {
    var previous: [Int:[String:AgentThread]] = [:]
    mutating func ingest(_ rows:[AgentThread], baseline:Bool, source:Int) -> [(AgentThread,String)] {
        let old = previous[source] ?? [:]
        defer { previous[source] = Dictionary(rows.map { ($0.id,$0) },uniquingKeysWith:{ _,b in b }) }
        guard !baseline, previous[source] != nil else { return [] }
        return rows.compactMap { t in
            guard !t.isUnlisted && !t.isShelved else { return nil }
            let before = old[t.id]
            if t.needsAttention && before?.needsAttention != true { return (t,"wait") }
            if t.isFailed && (before?.isFailed != true || before?.latestRunCompletedAt != t.latestRunCompletedAt) { return (t,"error") }
            if t.sidebarStatus == .ready, !["cancelled","interrupted"].contains(t.runtimeStatus ?? ""),
               let completion = t.latestRunCompletedAt, completion != before?.latestRunCompletedAt,
               Date().timeIntervalSince(completion) < 120 { return (t,"done") }
            return nil
        }
    }
}

@MainActor
final class Alerts {
    var tracker = AlertTracker()
    var queue: [(AgentThread,String)] = []
    var work: DispatchWorkItem?
    var lastSound = Date.distantPast
    func receive(_ rows:[AgentThread], baseline:Bool, source:Int) {
        queue += tracker.ingest(rows,baseline:baseline,source:source).filter { Preferences.shared.sound(for:$0.0.key) != "Silent" }
        guard !queue.isEmpty, work == nil else { return }
        let next = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.flush() } }
        work = next; DispatchQueue.main.asyncAfter(deadline:.now()+1.5,execute:next)
    }
    func reset() { work?.cancel(); work=nil; queue=[]; tracker=AlertTracker() }
    func flush() {
        let batch=queue; queue=[]; work=nil
        let prefs=Preferences.shared
        guard !prefs.muted, let first=batch.first(where:{$0.1 == "wait"}) ?? batch.first else { return }
        if Date().timeIntervalSince(lastSound)>3 { prefs.play(prefs.sound(for:first.0.key),event:first.1); lastSound=Date() }
        let content=UNMutableNotificationContent()
        content.title=batch.count>1 ? "\(batch.count) chats updated" : first.0.title
        content.body=batch.count>1 ? "Your crew has news. Open Pulse Notch to catch up." : first.1 == "wait" ? "Your agent needs you." : first.1 == "error" ? "This run hit an error." : "Your reply is ready."
        content.userInfo=["source":first.0.source,"thread":first.0.id]
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier:UUID().uuidString,content:content,trigger:nil))
    }
}

enum T3Link {
    static func url(environment:String,thread:String) -> URL? {
        // Detect the installed T3 channel, including Beta, rather than assuming stable.
        let app=URL(fileURLWithPath:"/Applications/T3 Code (Beta).app")
        let bundle=Bundle(url:app)
        let types=bundle?.object(forInfoDictionaryKey:"CFBundleURLTypes") as? [[String:Any]]
        let schemes=types?.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] } ?? []
        let scheme=schemes.first(where:{$0.hasPrefix("t3code")}) ?? "t3code"
        var components=URLComponents()
        components.scheme=scheme; components.host="threads"
        components.path="/\(environment)/\(thread)"
        return components.url
    }
}
