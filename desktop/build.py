#!/usr/bin/env python3
"""Build a local Mac app with bundled Chromium, Python service and FFmpeg."""
from pathlib import Path
import argparse,json,os,platform,plistlib,shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'.desktop-build'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');parser.add_argument('--release',action='store_true');args=parser.parse_args()
    if sys.platform!='darwin':raise SystemExit('The Mac application must be built on macOS.')
    if args.release and platform.machine()!='arm64':raise SystemExit('This release recipe targets Apple Silicon only.')
    if args.install:
        running=subprocess.run(['ps','-axo','command='],capture_output=True,text=True,check=True).stdout.splitlines()
        if any(line.startswith('/Applications/Cutline Studio.app/Contents/') for line in running):raise SystemExit('Quit Cutline Studio normally before installation so its open project can save safely.')
    electron=ROOT/'node_modules/electron/dist/Electron.app'
    if not electron.is_dir():raise SystemExit('Run npm install and node node_modules/electron/install.js first.')
    engine=BUILD/'resources/backend-build'
    subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onedir','--name','cutline-backend','--distpath',str(engine),'--workpath',str(BUILD/'pyinstaller'),'--specpath',str(BUILD),'--paths',str(ROOT),'--add-data',str(ROOT/'dist')+':dist',str(ROOT/'desktop/service.py')],cwd=ROOT,check=True)
    application=BUILD/'Cutline Studio.app'
    if application.exists():shutil.rmtree(application)
    subprocess.run(['ditto',str(electron),str(application)],check=True)
    contents=application/'Contents';resources=contents/'Resources';app=resources/'app';app.mkdir(exist_ok=True)
    for name in ['main.cjs','backend.cjs','preload.cjs','starting.html','mcp-setup.cjs']:shutil.copy2(ROOT/'desktop'/name,app/name)
    version=json.loads((ROOT/'package.json').read_text())['version']
    (app/'package.json').write_text(json.dumps({'name':'cutline-studio-desktop','productName':'Cutline Studio','version':version,'main':'main.cjs','license':'MIT'}))
    shutil.copytree(engine/'cutline-backend',resources/'backend',dirs_exist_ok=True)
    sys.path.insert(0,str(ROOT));from video_export import BINARY
    if args.release:BINARY=Path(os.environ.get('CUTLINE_RELEASE_DEPS',str(Path.home()/'.cache/cutline-release-arm64')))/'tools/ffmpeg'
    if not BINARY or not Path(BINARY).is_file():raise SystemExit('Prepare release dependencies, install FFmpeg, or set CUTLINE_FFMPEG_BINARY before packaging.')
    tools=resources/'backend/tools';tools.mkdir(exist_ok=True);shutil.copy2(BINARY,tools/'ffmpeg');(tools/'ffmpeg').chmod(0o755)
    (tools/'FFMPEG-LICENSE.txt').write_bytes(subprocess.run([str(BINARY),'-L'],capture_output=True,check=True).stdout+subprocess.run([str(BINARY),'-L'],capture_output=True,check=True).stderr)
    if args.release:
        deps=Path(os.environ.get('CUTLINE_RELEASE_DEPS',str(Path.home()/'.cache/cutline-release-arm64')))
        for name in ['ffmpeg','whisper-cli','ggml-large-v3-turbo-q5_0.bin']:
            if not (deps/'tools'/name).is_file():raise SystemExit('Run desktop/prepare-release.py before --release.')
            shutil.copy2(deps/'tools'/name,tools/name)
        shutil.copytree(deps/'licenses',resources/'licenses',dirs_exist_ok=True)
        shutil.copy2(Path(sys.base_prefix)/('lib/python'+str(sys.version_info.major)+'.'+str(sys.version_info.minor)+'/LICENSE.txt'),resources/'licenses/PYTHON-LICENSE.txt')
        import importlib.metadata
        pyinstaller=Path(importlib.metadata.distribution('pyinstaller').locate_file('pyinstaller-6.22.3.dist-info/licenses/COPYING.txt'))
        shutil.copy2(pyinstaller,resources/'licenses/PYINSTALLER-COPYING.txt')
        shutil.copy2(deps/'provenance.json',resources/'provenance.json')
        (tools/'FFMPEG-LICENSE.txt').write_bytes(subprocess.run([str(tools/'ffmpeg'),'-L'],capture_output=True,check=True).stderr)
    runtime=resources/'mcp-runtime';runtime.mkdir();(runtime/'bin').mkdir()
    node=shutil.which('node')
    if not node:raise SystemExit('Node.js is required at build time.')
    shutil.copy2(node,runtime/'bin/node')
    node_license=Path(node).resolve().parent.parent/'LICENSE'
    if not node_license.exists():raise SystemExit('Node distribution LICENSE is required.')
    shutil.copy2(node_license,runtime/'NODE-LICENSE.txt')
    shutil.copytree(ROOT/'mcp',runtime/'mcp',ignore=shutil.ignore_patterns('__pycache__'))
    (runtime/'dist').mkdir()
    for name in ['production-core.js','blur-renderer.js','editor-model.js','editing-workflows.js','frame-geometry.js','audio-editing.js','source-check.js']:shutil.copy2(ROOT/'dist'/name,runtime/'dist'/name)
    for name in ['package.json','package-lock.json','LICENSE','THIRD_PARTY.md']:shutil.copy2(ROOT/name,runtime/name)
    subprocess.run(['npm','ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=runtime,check=True)
    subprocess.run([str(runtime/'bin/node'),'-e',"require('./mcp/tools.cjs').createTools()"],cwd=runtime,check=True)
    for name in ['LICENSE','THIRD_PARTY.md']:shutil.copy2(ROOT/name,resources/name)
    icon=ROOT/'desktop/assets/Cutline.icns'
    if icon.exists():shutil.copy2(icon,resources/'Cutline.icns')
    info=contents/'Info.plist'
    with info.open('rb') as stream:configuration=plistlib.load(stream)
    executable=configuration['CFBundleExecutable'];(contents/'MacOS'/executable).rename(contents/'MacOS/Cutline Studio')
    configuration.update({'CFBundleExecutable':'Cutline Studio','CFBundleName':'Cutline Studio','CFBundleDisplayName':'Cutline Studio','CFBundleIdentifier':'studio.cutline.desktop','CFBundleShortVersionString':version,'CFBundleVersion':version,'LSMinimumSystemVersion':'13.5','CFBundleIconFile':'Cutline.icns','NSHighResolutionCapable':True,'NSHumanReadableCopyright':'Copyright 2026 Cutline Studio contributors','CFBundleDocumentTypes':[{'CFBundleTypeName':'Cutline Studio Project','CFBundleTypeExtensions':['cutline'],'CFBundleTypeRole':'Editor','LSHandlerRank':'Owner'}]})
    with info.open('wb') as stream:plistlib.dump(configuration,stream)
    # Sign nested native files before the app envelope. The community build is ad-hoc.
    if args.release:
        for native in resources.rglob('*'):
            if native.is_file() and (native.suffix in ('.node','.dylib') or native.name in ('node','ffmpeg','whisper-cli','cutline-backend')):
                subprocess.run(['codesign','--force','--sign','-',str(native)],check=True)
    subprocess.run(['codesign','--force','--deep','--sign','-',str(application)],check=True)
    subprocess.run(['codesign','--verify','--deep','--strict',str(application)],check=True)
    if args.install:
        target=Path('/Applications/Cutline Studio.app')
        if target.exists():
            backup=BUILD/'previous-app'
            if backup.exists():shutil.rmtree(backup)
            shutil.move(str(target),str(backup))
        subprocess.run(['ditto',str(application),str(target)],check=True)
        print('Installed:',target)
    else:print('Built:',application)
if __name__=='__main__':main()
