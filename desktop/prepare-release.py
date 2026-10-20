#!/usr/bin/env python3
"""Build the redistributable Apple Silicon tools; keep exact corresponding sources."""
from pathlib import Path
import hashlib, json, os, shutil, subprocess, urllib.request
ROOT=Path(__file__).resolve().parents[1]
DEST=Path(os.environ.get('CUTLINE_RELEASE_DEPS',str(Path.home()/'.cache/cutline-release-arm64')))
WHISPER='592feef04a1802b18cbeffd0fd0eb5d02570c2ec'
X264='b35605ace3ddf7c1a5d67a2eb553f034aef41d55'
MODEL='ggml-large-v3-turbo-q5_0.bin'
MODEL_REV='5359861c739e955e79d9a303bcbc70fb988958b1'
MODEL_SHA='394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2'
def run(args, cwd=None, env=None):subprocess.run(list(map(str,args)),cwd=cwd,env=env,check=True)
def main():
    DEST.mkdir(parents=True,exist_ok=True)
    sources=DEST/'sources';sources.mkdir(exist_ok=True)
    env={**os.environ,'MACOSX_DEPLOYMENT_TARGET':'13.0'}
    cmake=shutil.which('cmake') or str(ROOT/'.desktop-build/venv/bin/cmake')
    for name,url,ref in [('whisper.cpp','https://github.com/ggml-org/whisper.cpp.git',WHISPER),('x264','https://code.videolan.org/videolan/x264.git',X264),('ffmpeg','https://github.com/FFmpeg/FFmpeg.git','n7.1.5')]:
        folder=sources/name
        if not folder.exists():run(['git','clone','--no-checkout',url,folder])
        run(['git','checkout','--detach',ref],folder)
    whisper=sources/'whisper.cpp'
    run([cmake,'-S',whisper,'-B',DEST/'whisper-build','-DCMAKE_BUILD_TYPE=Release','-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0','-DCMAKE_OSX_ARCHITECTURES=arm64','-DBUILD_SHARED_LIBS=OFF','-DGGML_NATIVE=OFF','-DGGML_METAL_EMBED_LIBRARY=ON','-DWHISPER_BUILD_TESTS=OFF','-DWHISPER_BUILD_SERVER=OFF'])
    run([cmake,'--build',DEST/'whisper-build','--config','Release','--target','whisper-cli','-j','4'])
    prefix=DEST/'codec';prefix.mkdir(exist_ok=True)
    # A prefix containing spaces breaks upstream pkg-config flags; use a temporary symlink.
    alias=Path('/tmp/cutline-codec-'+str(os.getuid()))
    if alias.is_symlink():alias.unlink()
    if alias.exists():raise SystemExit('Temporary codec prefix already exists: '+str(alias))
    alias.symlink_to(prefix,target_is_directory=True)
    try:
        run(['./configure','--prefix='+str(alias),'--enable-static','--disable-cli','--disable-opencl','--host=aarch64-apple-darwin','--extra-cflags=-mmacosx-version-min=13.0'],sources/'x264',env)
        run(['make','-j4'],sources/'x264',env);run(['make','install'],sources/'x264',env)
        # FFmpeg configure uses pkg-config; provide the one dependency directly.
        pkg=DEST/'pkg-config'
        pkg.write_text('#!/bin/sh\ncase "$*" in\n*--version*) echo 1.0;;\n*--exists*) exit 0;;\n*--cflags*) echo -I'+str(alias)+'/include;;\n*--libs*) echo -L'+str(alias)+'/lib -lx264 -lpthread -lm;;\n*--modversion*) echo 0.164;;\n*) exit 0;;\nesac\n');pkg.chmod(0o755)
        run(['./configure','--prefix='+str(alias),'--arch=arm64','--cc=clang','--enable-gpl','--enable-libx264','--disable-autodetect','--enable-zlib','--disable-shared','--enable-static','--disable-doc','--disable-debug','--disable-ffplay','--disable-ffprobe','--pkg-config='+str(pkg),'--extra-cflags=-mmacosx-version-min=13.0','--extra-ldflags=-mmacosx-version-min=13.0'],sources/'ffmpeg',env)
        run(['make','-j4'],sources/'ffmpeg',env)
    finally:alias.unlink(missing_ok=True)
    tools=DEST/'tools';tools.mkdir(exist_ok=True)
    shutil.copy2(sources/'ffmpeg/ffmpeg',tools/'ffmpeg')
    encoders=subprocess.check_output([str(tools/'ffmpeg'),'-hide_banner','-encoders'],stderr=subprocess.DEVNULL).decode()
    if ' png ' not in encoders or ' libx264 ' not in encoders:raise SystemExit('Required PNG/H.264 encoder is missing')
    shutil.copy2(DEST/'whisper-build/bin/whisper-cli',tools/'whisper-cli')
    model=tools/MODEL
    if not model.exists():
        cached=Path.home()/'.cache/hyperframes/whisper/models'/MODEL
        if cached.exists():shutil.copy2(cached,model)
        else:urllib.request.urlretrieve('https://huggingface.co/ggerganov/whisper.cpp/resolve/'+MODEL_REV+'/'+MODEL,model)
    expected=MODEL_SHA
    actual=hashlib.sha256(model.read_bytes()).hexdigest()
    if actual!=expected:raise SystemExit('Whisper model checksum mismatch')
    notices=DEST/'licenses';notices.mkdir(exist_ok=True)
    for name,source in [('WHISPER-CPP-MIT.txt',whisper/'LICENSE'),('FFMPEG-GPLv2.txt',sources/'ffmpeg/COPYING.GPLv2'),('X264-GPLv2.txt',sources/'x264/COPYING')]:shutil.copy2(source,notices/name)
    urllib.request.urlretrieve('https://raw.githubusercontent.com/openai/whisper/main/LICENSE',notices/'WHISPER-MODEL-MIT.txt')
    (DEST/'provenance.json').write_text(json.dumps({'whisperCommit':WHISPER,'x264Commit':X264,'ffmpegTag':'n7.1.5','model':MODEL,'modelSHA256':actual,'modelURL':'https://huggingface.co/ggerganov/whisper.cpp/resolve/'+MODEL_REV+'/'+MODEL},indent=2))
    run([str(ROOT/'.desktop-build/venv/bin/python'),str(ROOT/'desktop/native-notices.py')])
    print('Release tools ready:',tools)
if __name__=='__main__':main()
