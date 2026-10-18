"""Normalize browser recordings for predictable ad-platform MP4 playback."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
CANDIDATES = [os.environ.get('CUTLINE_FFMPEG_BINARY'), shutil.which('ffmpeg'), str(ROOT/'tools/ffmpeg'),
              str(Path.home()/'Library/Application Support/Cutline Studio/tools/ffmpeg')]
BINARY = next((Path(p) for p in CANDIDATES if p and Path(p).is_file() and os.access(p, os.X_OK)), None)

def available():
    return BINARY is not None

def finalize(data, suffix):
    if not available():
        raise ValueError('The local video encoder is unavailable.')
    with tempfile.TemporaryDirectory(prefix='cutline-export-') as directory:
        source = Path(directory)/('recording'+suffix)
        target = Path(directory)/'export.mp4'
        source.write_bytes(data)
        command = [str(BINARY), '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', str(source),
                   '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'fps=30,format=yuv420p',
                   '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
                   '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-y', str(target)]
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600)
        except subprocess.TimeoutExpired:
            raise ValueError('Finishing this video took too long. Export a shorter project.')
        if result.returncode or not target.is_file():
            raise ValueError('The local encoder could not finish this recording.')
        return target.read_bytes()

# Explicit image frames avoid browser captureStream/requestAnimationFrame timing gaps.
import json
import struct
import threading
import time
import uuid

_FRAME_JOBS = {}
_FRAME_LOCK = threading.Lock()
_REAPER_STARTED = False

def _start_frame_reaper():
    global _REAPER_STARTED
    with _FRAME_LOCK:
        if _REAPER_STARTED:
            return
        _REAPER_STARTED = True
    def reap():
        while True:
            time.sleep(60)
            _expire_frame_jobs()
    threading.Thread(target=reap, name='cutline-export-cleanup', daemon=True).start()


def _remove_frame_job(job_id):
    with _FRAME_LOCK:
        job = _FRAME_JOBS.pop(job_id, None)
    if job:
        process = job['process']
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        if process.stdin and not process.stdin.closed:
            try:
                process.stdin.close()
            except (BrokenPipeError, OSError):
                pass
        job['log'].close()
        job['temporary'].cleanup()
    return job is not None

def _expire_frame_jobs():
    with _FRAME_LOCK:
        stale = [key for key, value in _FRAME_JOBS.items() if time.monotonic()-value['updated'] > 600]
    for key in stale:
        _remove_frame_job(key)

def begin_frames(metadata, audio):
    if not available():
        raise ValueError('The local MP4 encoder is unavailable.')
    _start_frame_reaper()
    _expire_frame_jobs()
    if not isinstance(metadata, dict):
        raise ValueError('Invalid export settings.')
    width, height, count = (metadata.get(key) for key in ['width','height','frames'])
    if any(type(value) is not int for value in [width,height,count]):
        raise ValueError('Invalid export dimensions or frame count.')
    if not (32 <= width <= 4096 and 32 <= height <= 2160 and width % 2 == height % 2 == 0 and 1 <= count <= 108000):
        raise ValueError('Choose an export under one hour and at most 2160p.')
    if len(audio) < 44 or audio[:4] != b'RIFF' or audio[8:12] != b'WAVE':
        raise ValueError('The export audio mix is incomplete.')
    with _FRAME_LOCK:
        if len(_FRAME_JOBS) >= 2:
            raise ValueError('Another export is still running. Cancel it before starting again.')
    temporary = tempfile.TemporaryDirectory(prefix='cutline-frames-')
    folder = Path(temporary.name)
    (folder/'audio.wav').write_bytes(audio)
    log = (folder/'encoder.log').open('wb')
    command = [str(BINARY), '-hide_banner', '-loglevel', 'error', '-nostdin',
               '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'mjpeg', '-i', 'pipe:0',
               '-i', str(folder/'audio.wav'), '-map', '0:v:0', '-map', '1:a:0',
               '-vf', f'scale={width}:{height},format=yuv420p', '-frames:v', str(count),
               '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
               '-c:a', 'aac', '-b:a', '192k', '-af', 'apad', '-t', str(count/30),
               '-movflags', '+faststart', '-y', str(folder/'export.mp4')]
    try:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
    except OSError:
        log.close()
        temporary.cleanup()
        raise ValueError('Could not start the local encoder.')
    job_id = uuid.uuid4().hex
    with _FRAME_LOCK:
        _FRAME_JOBS[job_id] = {'process':process,'temporary':temporary,'folder':folder,'log':log,
                               'expected':count,'checkMovingTail':metadata.get('checkMovingTail') is True,'received':0,'updated':time.monotonic(),'lock':threading.Lock()}
    return {'id':job_id,'fps':30,'frames':count}

def append_frames(job_id, first, packet):
    with _FRAME_LOCK:
        job = _FRAME_JOBS.get(job_id)
    if not job:
        raise ValueError('Export session expired. Start the export again.')
    images, offset = [], 0
    while offset < len(packet):
        if offset+4 > len(packet):
            raise ValueError('Incomplete frame packet.')
        length = struct.unpack_from('>I', packet, offset)[0]
        offset += 4
        if not 4 <= length <= 8*1024*1024 or offset+length > len(packet):
            raise ValueError('Incomplete export frame.')
        frame = packet[offset:offset+length]
        offset += length
        if frame[:2] != b'\xff\xd8' or frame[-2:] != b'\xff\xd9':
            raise ValueError('Invalid export image.')
        images.append(frame)
    if not images or len(images) > 30:
        raise ValueError('Invalid frame batch size.')
    with job['lock']:
        if first != job['received'] or first+len(images) > job['expected']:
            raise ValueError('Export frames arrived out of order. Restart the export.')
        try:
            for frame in images:
                job['process'].stdin.write(frame)
            job['process'].stdin.flush()
        except (BrokenPipeError, OSError, ValueError):
            _remove_frame_job(job_id)
            raise ValueError('The local encoder stopped while writing video frames.')
        job['received'] += len(images)
        job['updated'] = time.monotonic()
        return {'received':job['received'],'frames':job['expected']}

def finish_frames(job_id):
    with _FRAME_LOCK:
        job = _FRAME_JOBS.get(job_id)
    if not job:
        raise ValueError('Export session expired.')
    with job['lock']:
        if job['received'] != job['expected']:
            raise ValueError(f"Export incomplete: received {job['received']} of {job['expected']} frames.")
        try:
            job['process'].stdin.close()
            job['process'].wait(timeout=120)
            target = job['folder']/'export.mp4'
            if job['process'].returncode or not target.is_file():
                raise ValueError('The encoder could not finish the complete video.')
            output = target.read_bytes()
            report = inspect_video(output)
            if report['frames'] != job['expected'] or report['videoDuration'] < job['expected']/30-.1:
                raise ValueError('The completed file is missing video frames. No incomplete export was saved.')
            if job['checkMovingTail'] and any(part['end'] >= report['videoDuration']-.15 and part['end']-part['start'] >= 2 for part in report['frozen']):
                raise ValueError('The final scene stopped changing during rendering. No frozen export was saved. Retry with the original source video.')
            return output
        except subprocess.TimeoutExpired:
            raise ValueError('The encoder timed out. Try a lower resolution.')
        finally:
            _remove_frame_job(job_id)

def cancel_frames(job_id):
    return _remove_frame_job(job_id)

# Decode source timestamps and detect already-frozen footage before rendering it again.
import hashlib
import re
_PROBE_CACHE = {}

def inspect_video(data):
    if not available():
        raise ValueError('The local video checker is unavailable.')
    digest = hashlib.sha256(data).hexdigest()
    if digest in _PROBE_CACHE:
        return _PROBE_CACHE[digest]
    with tempfile.TemporaryDirectory(prefix='cutline-check-') as directory:
        source = Path(directory)/'source.media'
        source.write_bytes(data)
        command = [str(BINARY), '-hide_banner', '-nostdin', '-nostats', '-i', str(source),
                   '-map', '0:v:0', '-an', '-vf', 'scale=160:-2,freezedetect=n=-50dB:d=1',
                   '-f', 'null', '-', '-progress', 'pipe:1']
        try:
            result = subprocess.run(command, capture_output=True, timeout=240)
        except subprocess.TimeoutExpired:
            raise ValueError('Checking this video took too long. Use a shorter source clip.')
        if result.returncode:
            raise ValueError('This source video could not be fully decoded. Replace it with the original file.')
        progress = result.stdout.decode(errors='replace')
        frames = re.findall(r'^frame=(\d+)', progress, re.MULTILINE)
        times = re.findall(r'^out_time_us=(-?\d+)', progress, re.MULTILINE)
        if not frames or not times or int(frames[-1]) <= 0:
            raise ValueError('No readable video frames were found.')
        duration = max(0, int(times[-1])/1000000)
        frozen, start = [], None
        for event, value in re.findall(r'lavfi\.freezedetect\.(freeze_start|freeze_end):\s*([\d.]+)', result.stderr.decode(errors='replace')):
            if event == 'freeze_start':
                start = float(value)
            elif start is not None:
                frozen.append({'start':start,'end':float(value)})
                start = None
        if start is not None:
            frozen.append({'start':start,'end':duration})
        report = {'videoDuration':duration,'frames':int(frames[-1]),'frozen':frozen,'sha256':digest}
        if len(_PROBE_CACHE) > 12:
            _PROBE_CACHE.clear()
        _PROBE_CACHE[digest] = report
        return report
