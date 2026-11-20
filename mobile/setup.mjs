import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import webpush from 'web-push';
const dir=path.join(process.env.LOCALAPPDATA,'akin-host','pulse-pocket');
fs.mkdirSync(dir,{recursive:true});
const file=path.join(dir,'config.json');
if(fs.existsSync(file)){console.log('Existing private configuration preserved');process.exit(0);}
const status=JSON.parse(execFileSync('C:\\Program Files\\Tailscale\\tailscale.exe',['status','--json'],{encoding:'utf8',windowsHide:true}));
const allowedUser=status.User[String(status.Self.UserID)].LoginName;
const origin='https://'+status.Self.DNSName.replace(/\.$/,'')+':8443';
// Capture the read-only token directly, never print it or place it in a shell argument.
const token=execFileSync('C:\\Windows\\System32\\cmd.exe',['/d','/s','/c','C:\\Users\\mirik\\.t3\\bin\\t3.cmd auth session issue --scope orchestration:read --ttl 90d --label PulsePocket-read-only --token-only'],{encoding:'utf8',windowsHide:true,windowsVerbatimArguments:true}).trim();
if(!token||token.includes('\n'))throw Error('Unexpected CLI token output');
fs.writeFileSync(file,JSON.stringify({origin,port:3791,allowedUser,vapid:webpush.generateVAPIDKeys(),sources:[{name:'akın',url:'http://127.0.0.1:3773',token}]}),{mode:0o600});
console.log('Private configuration created; read-only token expires in 90 days');
