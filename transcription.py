"""Optional local Whisper adapter. No accounts, remote APIs, or model downloads."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

CACHE = Path.home() / '.cache/hyperframes/whisper'
BINARY = Path(os.environ.get('CUTLINE_WHISPER_BINARY', str(CACHE / 'whisper.cpp/build/bin/whisper-cli')))
MODEL = Path(os.environ.get('CUTLINE_WHISPER_MODEL', str(CACHE / 'models/ggml-large-v3-turbo-q5_0.bin')))
JOBS = {}
LOCK = threading.Lock()
SLOT = threading.Semaphore(1)
LANGUAGES = {'auto', 'en', 'fr', 'ar', 'es', 'pt', 'de', 'it'}

def available():
    return BINARY.is_file() and os.access(BINARY, os.X_OK) and MODEL.is_file()

def status(job_id):
    with LOCK:
        job = JOBS.get(job_id)
        return {k:v for k,v in job.items() if k not in {'process', 'cancel'}} if job else None

def cancel(job_id):
    with LOCK:
        job = JOBS.get(job_id)
        if not job:
            return False
        job['cancel'] = True
        job['status'] = 'cancelled'
        process = job.get('process')
    if process and process.poll() is None:
        process.terminate()
    return True

def submit(data, language):
    if not available():
        raise ValueError('The local Whisper engine is unavailable. Import SRT/VTT captions instead.')
    if language not in LANGUAGES:
        raise ValueError('Unsupported caption language.')
    with LOCK:
        active = sum(job['status'] in {'queued', 'running'} for job in JOBS.values())
        if active >= 3:
            raise ValueError('The local speech engine is busy. Wait for a current job to finish.')
        now = time.time()
        for key in [k for k,v in JOBS.items() if now-v['created'] > 3600 and v['status'] not in {'queued', 'running'}]:
            JOBS.pop(key)
        job_id = str(uuid.uuid4())
        JOBS[job_id] = {'id':job_id, 'status':'queued', 'created':now, 'cancel':False}
    thread = threading.Thread(target=run, args=(job_id, data, language), daemon=True)
    thread.start()
    return job_id

def run(job_id, data, language):
    with SLOT:
        with LOCK:
            if JOBS[job_id]['cancel']:
                return
            JOBS[job_id]['status'] = 'running'
        try:
            with tempfile.TemporaryDirectory(prefix='cutline-captions-') as directory:
                folder = Path(directory)
                audio = folder/'audio.wav'
                audio.write_bytes(data)
                prefix = folder/'captions'
                command = [str(BINARY), '-m', str(MODEL), '-f', str(audio), '-l', language,
                           '-t', '4', '-ml', '42', '-sow', '-osrt', '-of', str(prefix), '-np']
                process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                           stderr=subprocess.PIPE, cwd=str(BINARY.parent))
                with LOCK:
                    JOBS[job_id]['process'] = process
                    cancelled = JOBS[job_id]['cancel']
                if cancelled:
                    process.terminate()
                try:
                    _, errors = process.communicate(timeout=1200)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate()
                    raise ValueError('Local transcription took too long. Try a shorter selected clip.')
                with LOCK:
                    cancelled = JOBS[job_id]['cancel']
                if cancelled:
                    return
                if process.returncode:
                    raise ValueError('Whisper could not transcribe this audio. Try another language or a shorter clip.')
                srt = prefix.with_suffix('.srt').read_text(encoding='utf-8')
                with LOCK:
                    JOBS[job_id].update(status='done', srt=srt)
        except Exception as error:
            with LOCK:
                if not JOBS[job_id]['cancel']:
                    JOBS[job_id].update(status='failed', error=str(error))
        finally:
            with LOCK:
                JOBS[job_id].pop('process', None)
