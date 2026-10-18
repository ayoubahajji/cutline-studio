#!/usr/bin/env python3
"""Start/reuse the loopback editor independently of its opening terminal."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import plistlib
import subprocess
import sys
import shutil
import time
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parent
MARKER='Cutline Studio local editor v1'

def running_url():
    for port in range(4178,4199):
        url=f'http://127.0.0.1:{port}'
        try:
            with urlopen(url+'/__cutline_health__',timeout=.15) as response:
                if response.read(128).decode()==MARKER:
                    return url
        except Exception:
            pass
    return None

def start():
    existing=running_url()
    (ROOT/'output').mkdir(exist_ok=True)
    if sys.platform=='darwin':
        runtime=Path.home()/'Library/Application Support/Cutline Studio'
        runtime.mkdir(parents=True,exist_ok=True)
        (runtime/'output').mkdir(exist_ok=True)
        changed=False
        for name in ['serve.py','transcription.py','video_export.py']:
            source=ROOT/name
            destination=runtime/name
            if not destination.exists() or destination.read_bytes()!=source.read_bytes():
                shutil.copy2(source,destination)
                changed=True
        for source in (ROOT/'dist').rglob('*'):
            if not source.is_file():
                continue
            destination=runtime/'dist'/source.relative_to(ROOT/'dist')
            destination.parent.mkdir(parents=True,exist_ok=True)
            if not destination.exists() or destination.read_bytes()!=source.read_bytes():
                shutil.copy2(source,destination)
                changed=True
        from video_export import BINARY
        if BINARY:
            (runtime/'tools').mkdir(exist_ok=True)
            destination=runtime/'tools/ffmpeg'
            if not destination.exists() or destination.stat().st_size!=BINARY.stat().st_size:
                shutil.copy2(BINARY,destination)
                changed=True
        label='studio.cutline.local.'+hashlib.sha256(str(ROOT).encode()).hexdigest()[:10]
        domain=f'gui/{os.getuid()}'
        target=domain+'/'+label
        plist=runtime/(label+'.plist')
        configuration={
            'Label':label,
            'ProgramArguments':[str(Path(sys.base_prefix)/'Resources/Python.app/Contents/MacOS/Python') if (Path(sys.base_prefix)/'Resources/Python.app/Contents/MacOS/Python').exists() else sys.executable,str(runtime/'serve.py')],
            'WorkingDirectory':str(runtime),
            'RunAtLoad':True,
            'KeepAlive':{'SuccessfulExit':False},
            'ThrottleInterval':5,
            'ProcessType':'Background',
            'StandardOutPath':str(runtime/'output/server.log'),
            'StandardErrorPath':str(runtime/'output/server.log')
        }
        with plist.open('wb') as handle:
            plistlib.dump(configuration,handle)
        loaded=subprocess.run(['launchctl','print',target],capture_output=True).returncode==0
        if existing and loaded and not changed:
            return existing
        if loaded:
            subprocess.run(['launchctl','bootout',target],capture_output=True)
        command=['launchctl','bootstrap',domain,str(plist)]
        result=subprocess.run(command,capture_output=True,text=True)
        if result.returncode:
            raise RuntimeError('macOS could not start the editor service: '+result.stderr.strip())
        (ROOT/'output/service.json').write_text(json.dumps({'target':target,'plist':str(plist),'runtime':str(runtime)}))
    else:
        if existing:
            return existing
        with (ROOT/'output/server.log').open('a') as log:
            subprocess.Popen([sys.executable,str(ROOT/'serve.py')],cwd=str(ROOT),stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    for attempt in range(60):
        url=running_url()
        if url:
            return url
        time.sleep(.1)
    raise RuntimeError('The editor service did not become ready. See output/server.log.')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--open',action='store_true')
    parser.add_argument('--stop',action='store_true')
    args=parser.parse_args()
    if args.stop:
        label='studio.cutline.local.'+hashlib.sha256(str(ROOT).encode()).hexdigest()[:10]
        subprocess.run(['launchctl','bootout',f'gui/{os.getuid()}/'+label],capture_output=True)
        print('Cutline Studio server stopped.')
        return
    url=start()
    print('Cutline Studio is ready: '+url)
    if args.open:
        if Path('/Applications/Google Chrome.app').is_dir():
            subprocess.Popen(['/usr/bin/open','-a','Google Chrome',url])
        else:
            import webbrowser
            webbrowser.open(url)

if __name__=='__main__':
    try:
        main()
    except Exception as error:
        print(str(error),file=sys.stderr)
        raise SystemExit(1)
