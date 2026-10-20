"""End-to-end API export against the actual self-contained Mac service."""
from pathlib import Path
import io,json,os,socket,struct,subprocess,sys,tempfile,time,urllib.request,wave
app=Path(sys.argv[1] if len(sys.argv)>1 else '.desktop-build/Cutline Studio.app').resolve()
engine=app/'Contents/Resources/backend';ffmpeg=engine/'tools/ffmpeg'
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
url='http://127.0.0.1:'+str(port)
def request(route,data=None,headers=None):
    req=urllib.request.Request(url+route,data=data,headers=headers or {})
    with urllib.request.urlopen(req,timeout=60) as response:return response.read()
with tempfile.TemporaryDirectory(prefix='cutline-packaged-qa-') as directory:
    env={**os.environ,'PATH':'/nonexistent','CUTLINE_STATE_DIR':directory,'CUTLINE_FFMPEG_BINARY':str(ffmpeg)}
    with open(Path(directory)/'service.log','w') as log:
        service=subprocess.Popen([str(engine/'cutline-backend'),'--port',str(port)],cwd=directory,env=env,stdout=log,stderr=log)
        try:
            deadline=time.monotonic()+20
            while True:
                try:
                    assert request('/__cutline_health__')==b'Cutline Studio local editor v1';break
                except Exception:
                    if time.monotonic()>deadline:raise
                    time.sleep(.1)
            assert json.loads(request('/api/capabilities'))['frame_export']
            raw=subprocess.run([str(ffmpeg),'-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=2','-f','lavfi','-i','color=c=blue:size=160x90:rate=30:duration=2','-f','lavfi','-i','testsrc=size=160x90:rate=30:duration=2','-filter_complex','[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p','-c:v','mjpeg','-f','image2pipe','-'],capture_output=True,check=True).stdout
            images=[];start=0
            while start<len(raw):
                end=raw.index(b'\xff\xd9',start)+2;images.append(raw[start:end]);start=end
            assert len(images)==180
            audio=io.BytesIO()
            with wave.open(audio,'wb') as writer:
                writer.setparams((1,2,16000,0,'NONE','not compressed'));writer.writeframes(b'\0\0'*96000)
            metadata={'width':160,'height':90,'frames':180,'checkMovingTail':True}
            job=json.loads(request('/api/frame-exports',audio.getvalue(),{'Content-Type':'audio/wav','X-Cutline-Export':json.dumps(metadata)}))['id']
            for first in range(0,180,10):
                packet=b''.join(struct.pack('>I',len(frame))+frame for frame in images[first:first+10])
                result=json.loads(request('/api/frame-exports/'+job+'/frames',packet,{'X-Cutline-First-Frame':str(first)}));assert result['received']==first+10
            output=request('/api/frame-exports/'+job+'/finish',b'');target=Path(directory)/'qa.mp4';target.write_bytes(output)
            decoded=subprocess.run([str(ffmpeg),'-v','error','-i',str(target),'-map','0:v:0','-f','null','-','-progress','pipe:1'],capture_output=True,text=True,check=True)
            assert 'frame=180\n' in decoded.stdout
            report=json.loads(request('/api/check-video',output,{'Content-Type':'video/mp4'}))
            assert report['frames']==180,report
            print('PASS: packaged service with no external runtimes: three-scene MP4, moving final scene, 180/180 decoded frames, source verification and API delivery')
        finally:
            service.terminate()
            try:service.wait(timeout=5)
            except subprocess.TimeoutExpired:service.kill();service.wait()
