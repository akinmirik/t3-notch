"""Hidden per-user supervisor. Source copy is installed under ~/Scripts."""
import os, pathlib, subprocess, time, msvcrt
folder=pathlib.Path(os.environ['LOCALAPPDATA'])/'akin-host/pulse-pocket'
folder.mkdir(parents=True,exist_ok=True)
with (folder/'launcher.lock').open('a+b') as lock:
    lock.seek(0); lock.write(b'0'); lock.flush(); lock.seek(0)
    try: msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    except OSError: raise SystemExit(0)
    (folder/'launcher.pid').write_text(str(os.getpid()))
    while True:
        log=folder/'service.log'
        if log.exists() and log.stat().st_size>2_000_000:
            log.replace(folder/'service.previous.log')
        with log.open('ab',buffering=0) as output:
            child=subprocess.Popen([r'C:\Program Files\nodejs\node.exe',str(pathlib.Path.home()/'t3-notch/mobile/server.mjs')],stdout=output,stderr=output,creationflags=subprocess.CREATE_NO_WINDOW)
            (folder/'server.pid').write_text(str(child.pid))
            child.wait()
        time.sleep(5)
