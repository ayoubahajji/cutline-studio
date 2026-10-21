"""Exercise app/MCP parity through the real local HTTP service, without browser access."""
from pathlib import Path
import base64, functools, json, os, shutil, subprocess, sys, tempfile, threading, time, urllib.request, urllib.error
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import serve, production_jobs, video_export
from http.server import ThreadingHTTPServer
root=Path(tempfile.mkdtemp(prefix='cutline-production-http-'))
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(serve.Handler,directory=str(serve.ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
def request(url,data=None,origin=None):
    headers={'Content-Type':'application/json'}
    if origin:headers['Origin']=origin
    with urllib.request.urlopen(urllib.request.Request(base+url,data=json.dumps(data).encode() if data is not None else None,headers=headers),timeout=30) as r:return r.read()
def wait(key):
    for _ in range(600):
        job=json.loads(request('/api/production/jobs/'+key))
        if job['status']!='running':return job
        time.sleep(.05)
    raise AssertionError('Job timed out')
try:
    assert json.loads(request('/api/capabilities'))['production']
    file=root/'moving.mp4';subprocess.run([str(video_export.BINARY),'-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=3','-c:v','libx264','-pix_fmt','yuv420p',str(file)],check=True)
    portable={'format':'cutline','version':1,'project':{'name':'HTTP parity','ratio':'16:9','muted':{},'locked':{},'clips':[{'id':'original-clip','assetId':'original-asset','track':'video','name':'Footage','start':0,'duration':3,'audioMuted':True}]},'assets':[{'id':'original-asset','name':'moving.mp4','type':'video','data':'data:video/mp4;base64,'+base64.b64encode(file.read_bytes()).decode()}]}
    payload={'portable':portable,'tool':'cutline_background_music','args':{}}
    try:request('/api/production/jobs',payload,'https://untrusted.invalid');raise AssertionError('Cross-origin write accepted')
    except urllib.error.HTTPError as e:assert e.code==403
    key=json.loads(request('/api/production/jobs',payload))['id'];job=wait(key);assert job['status']=='done',job
    clips=job['updated']['project']['clips'];assert next(c for c in clips if c['track']=='video')['id']=='original-clip';assert next(c for c in clips if c.get('audioRole')=='music')['volume']==7
    payload['tool']='cutline_render';payload['args']={'height':180};key=json.loads(request('/api/production/jobs',payload))['id'];job=wait(key);assert job['status']=='done',job;assert job['percent']==100;assert job['result']['frames']==90
    artifact=next(i for i,a in enumerate(job['artifacts']) if a['path']==job['result']['path']);data=request('/api/production/jobs/'+key+'/files/'+str(artifact));assert len(data)>1000;report=video_export.inspect_video(data);assert report['frames']==90
    try:request('/api/production/jobs/'+key+'/files/-1');raise AssertionError('Negative artifact accepted')
    except urllib.error.HTTPError as e:assert e.code==400
    payload['tool']='cutline_project_list';key=json.loads(request('/api/production/jobs',payload))['id'];assert wait(key)['status']=='failed'
    payload['tool']='cutline_render';payload['args']={'height':2160};key=json.loads(request('/api/production/jobs',payload))['id']
    # Revalidate a live native process before cancellation.
    for _ in range(100):
        with production_jobs.LOCK:proc=production_jobs.JOBS[key].get('process')
        if proc and proc.poll() is None:break
        time.sleep(.02)
    assert proc and proc.poll() is None
    request('/api/production/jobs/'+key+'/cancel',{});assert wait(key)['status']=='cancelled'
    for _ in range(100):
        if proc.poll() is not None:break
        time.sleep(.02)
    assert proc.poll() is not None
    print('PASS: real app HTTP → same MCP tools, 7% music, clip identity, verified frame-complete MP4, artifact confinement, cross-origin rejection, unsupported action rejection and live-job cancellation')
finally:
    server.shutdown();server.server_close()
    with production_jobs.LOCK:keys=list(production_jobs.JOBS)
    for key in keys:production_jobs.cancel(key)
    for key in keys:shutil.rmtree(production_jobs.JOBS[key]['root'],ignore_errors=True)
    shutil.rmtree(root,ignore_errors=True)
