"""Bounded native production jobs shared with the MCP tool engine."""
from pathlib import Path
import json, os, sys, signal, shutil, subprocess, tempfile, threading, time, uuid
ROOT=Path(__file__).resolve().parent
LOCK=threading.Lock()
JOBS={}
def runtime():
    bundled=(Path(sys.executable).resolve().parent.parent if getattr(sys,'frozen',False) else ROOT.parent)/'mcp-runtime'
    if (bundled/'bin/node').is_file():return bundled/'bin/node',bundled/'mcp/app-worker.cjs'
    node=shutil.which('node')
    if node and (ROOT/'node_modules/zod').is_dir():return Path(node),ROOT/'mcp/app-worker.cjs'
    raise ValueError('The native production runtime is unavailable. Install the current Mac build.')
def available():
    try:runtime();return True
    except ValueError:return False
def clean():
    for key,job in list(JOBS.items()):
        if job['status']!='running' and time.time()-job['created']>86400:
            shutil.rmtree(job['root'],ignore_errors=True);del JOBS[key]
def submit(request):
    node,worker=runtime()
    if not isinstance(request,dict) or not isinstance(request.get('portable'),dict):raise ValueError('Choose a valid project.')
    with LOCK:
        clean()
        if sum(j['status']=='running' for j in JOBS.values())>=2:raise ValueError('Two production jobs are already running.')
        key=str(uuid.uuid4());root=Path(tempfile.mkdtemp(prefix='cutline-production-'));job={'id':key,'root':str(root),'created':time.time(),'status':'running','percent':0,'phase':'preparing'};JOBS[key]=job
    def work():
        proc=None
        try:
            env={**os.environ,'CUTLINE_MCP_HOME':str(root),'CUTLINE_APP_WORKER':'1'}
            proc=subprocess.Popen([str(node),str(worker)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,start_new_session=True)
            with LOCK:
                job['process']=proc
                if job['status']=='cancelled':os.killpg(proc.pid,signal.SIGKILL)
            # Drain stderr concurrently to avoid pipe deadlocks.
            errors=[]
            def drain():
                for line in proc.stderr:errors.append(line[-4000:]);errors[:]=errors[-4:]
            threading.Thread(target=drain,daemon=True).start()
            def feed():
                try:proc.stdin.write(json.dumps(request).encode());proc.stdin.close()
                except (OSError,BrokenPipeError):pass
            threading.Thread(target=feed,daemon=True).start()
            deadline=threading.Timer(1800,lambda:cancel(key));deadline.daemon=True;deadline.start()
            try:
                for line in proc.stdout:
                    if len(line)>256*1024*1024:raise ValueError('Production result exceeded its size limit.')
                    record=json.loads(line)
                    with LOCK:
                        if job['status']=='cancelled':continue
                        if record['type']=='progress':job.update(percent=max(job['percent'],min(99,record.get('percent',0))),phase=record.get('phase','working'))
                        elif record['type']=='error':raise ValueError(record['error'])
                        elif record['type']=='done':job.update(status='done',percent=100,result=record['result'],updated=record['updated'],artifacts=record['artifacts'])
                code=proc.wait()
                if code and job['status']!='cancelled':raise ValueError(b''.join(errors).decode(errors='replace') or 'Native production failed.')
                if job['status']=='running':raise ValueError('Native production stopped without a completed result.')
            finally:deadline.cancel()
        except Exception as error:
            with LOCK:
                if job['status']!='cancelled':job.update(status='failed',error=str(error))
        finally:
            if proc and proc.poll() is None:
                try:os.killpg(proc.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                proc.wait()
            with LOCK:job.pop('process',None)
    threading.Thread(target=work,daemon=True).start()
    return {'id':key,'status':'running'}
def status(key):
    with LOCK:
        job=JOBS.get(key)
        if not job:raise ValueError('Production job not found.')
        return {k:v for k,v in job.items() if k not in ('root','process')}
def cancel(key):
    with LOCK:
        job=JOBS.get(key)
        if not job:return False
        if job['status']!='running':return False
        job['status']='cancelled';proc=job.get('process')
        if proc:
            try:os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError:pass
        return True
def artifact(key,index):
    with LOCK:
        job=JOBS.get(key)
        if not job or job['status']!='done':raise ValueError('The production job is not complete.')
        items=job.get('artifacts',[])
        if index<0 or index>=len(items):raise ValueError('Artifact not found.')
        file=Path(items[index]['path']).resolve();root=Path(job['root']).resolve()
        if root not in file.parents or not file.is_file():raise ValueError('Artifact is outside this job.')
        return file
