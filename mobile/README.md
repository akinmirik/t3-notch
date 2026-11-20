# Pulse Pocket

Personal, tailnet-only iPhone companion for Pulse. A Home Screen PWA with the same pet icon, live host-agent status, and encrypted Web Push for completions, questions and errors. The host stays on; the Mac and web app need not stay open. iOS chooses the notification sound.

## Installed architecture

- `127.0.0.1:3791`: Node service. Tailscale Serve exposes it at the host's HTTPS origin on port 8443, separately from T3's port 443.
- Only the configured Tailscale user may read app data or register a phone. Serve injects the identity header. POST requests additionally require the exact app origin. Do not expose the loopback server on the LAN or internet.
- T3 uses a dedicated 90-day `orchestration:read` token. `orchestration.subscribeShell` supplies metadata; no chat message bodies are read or sent. Reconnection snapshots are silent.
- Config, VAPID private key and subscriptions live outside Git in `%LOCALAPPDATA%\akin-host\pulse-pocket`. Keep VAPID keys stable or phones must subscribe again. Renew the T3 token before expiry.
- `launcher.py` is copied to `C:\Users\mirik\Scripts\PulsePocketLauncher.py` and run by Pythonw from the `Pulse Pocket.lnk` user Startup shortcut. It restarts a failed Node process with a delay and rotates its bounded log. This starts on Windows **user login**, not before login.

## Phone installation

1. Enable the personal Tailscale network on the iPhone.
2. Open `https://akin-host.tail13abb4.ts.net:8443/` in Safari.
3. Share → Add to Home Screen → Add.
4. Open Pulse from its new icon; tap Enable notifications and allow the iOS prompt.
5. Tap Send a test. Pause alerts and Disconnect this phone affect only this browser installation.

The cached shell and push handler do not fetch private data to show a notification. Opening or refreshing agent status requires Tailscale; receiving an already-subscribed Web Push uses Apple's push service and an internet connection. Actual iPhone receipt must be verified on the device.

## Development and checks

Use `npm ci --ignore-scripts`, `npm test`, then `node setup.mjs` once on the host. Setup preserves an existing private config. Start with `npm start`. Node 22+ is recommended. The installed host uses Node 26.13.1. `npm audit` was clean after using ws 8.23.0.

Do not log subscriptions, private keys, tokens, or complete upstream responses. `/healthz` returns counts only. Service logs deliberately omit endpoint URLs and response bodies. Push endpoints are restricted to Apple, FCM and Mozilla services to prevent arbitrary server-side requests; expired subscriptions are removed.

To stop the installed copy, verify the launcher/server PID command lines against this app before terminating them, remove only the Pulse Pocket startup shortcut, then run `tailscale serve --https=8443 off`. Leave port 443 and the T3/Apollo/Tailscale services intact. Keep the private config as a protected backup for reinstallation; deleting it requires re-pairing phones.

Initial scope: host agents. Mac-local agents are not exposed or monitored by this service. The existing native Mac app continues monitoring its own two sources separately.

## Conversations, quiet hours, and Blender

Notifications carry the T3 web conversation URL (`/<environmentId>/<threadId>`), resolved from the live environment endpoint. Tapping a crew row or a conversation update opens the same URL. Tailscale and a valid T3 web login are required; no T3 access token is embedded in links. Old notifications retain their original destination.

Quiet hours default to **00:00–08:00 Europe/Istanbul**, per phone. Edit or disable them in Pulse. Normal completions are held in a persistent bounded queue (latest 100); when the window ends, one recap is sent. Errors and requests for input bypass quiet hours. Explicit tests also bypass the schedule; the global Pause alerts button still suppresses everything. Paused devices receive any already-queued recap after resuming. Subscription refreshes preserve settings and pending updates.

`blender/pulse_notify.py` is installed under the user's Blender 4.5 `scripts/startup` folder. It loads at the next **normal** Blender launch without restarting the current session. Render completion fires once per job, including animation/video renders. Cancellation is reported as cancelled, never successful. It writes small atomic envelopes to the private local `jobs` spool; the service deduplicates and consumes them. No scene settings or Blender script-execution security policy are changed. `--factory-startup` deliberately skips user startup scripts; explicitly load/register the module if a render job uses that flag.

Model exporters do not share a universal completion handler. For scripted GLB/FBX/USD exports, wrap the successful synchronous operation:

```python
import pulse_notify
with pulse_notify.export_job('Product GLB'):
    result = bpy.ops.export_scene.gltf(filepath=output_path)
    if 'FINISHED' not in result:
        raise RuntimeError('Export did not finish')
```

Ordinary GUI model exports are not automatically observed. Render/video output jobs are automatic. Blender failure before any completion/cancel handler runs (for example, a process crash) cannot be reported by the hook itself.
