#!/usr/bin/env python3
"""Run Cutline Studio on loopback only. No dependencies or internet required."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.request import urlopen
import argparse
import os
import functools
import json
import webbrowser
import subprocess
from urllib.parse import urlparse
import transcription
import video_export
import production_jobs
import mimetypes
import shutil

ROOT = Path(__file__).resolve().parent
MARKER = 'Cutline Studio local editor v1'
class Handler(SimpleHTTPRequestHandler):
    def api_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def valid_local_request(self):
        port = self.server.server_port
        hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        if self.headers.get('Host') not in hosts:
            self.api_json({'error':'Use the local editor address.'}, 403)
            return False
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://{host}' for host in hosts}:
            self.api_json({'error':'Open this request from the local editor.'}, 403)
            return False
        return True
    def do_POST(self):
        if not self.valid_local_request():
            return
        if self.path == '/api/production/jobs' or self.path.startswith('/api/production/jobs/'):
            try:
                parts=self.path.split('/')
                if self.path == '/api/production/jobs':
                    length=int(self.headers.get('Content-Length','0'))
                    if not 2<=length<=768*1024*1024:raise ValueError('Project must be under 768 MB.')
                    body=self.rfile.read(length)
                    if len(body)!=length:raise ValueError('Incomplete project upload.')
                    self.api_json(production_jobs.submit(json.loads(body)),201)
                elif len(parts)==6 and parts[5]=='cancel':self.api_json({'cancelled':production_jobs.cancel(parts[4])})
                else:self.api_json({'error':'Unknown production endpoint.'},404)
            except (ValueError,OSError) as error:self.api_json({'error':str(error)},400)
            return
        if self.path == '/api/check-video':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 100 <= length <= 512*1024*1024:
                    raise ValueError('Source checking supports video files up to 512 MB.')
                data = self.rfile.read(length)
                if len(data) != length:
                    raise ValueError('The source video upload was incomplete.')
                self.api_json(video_export.inspect_video(data))
            except (ValueError, OSError) as error:
                self.api_json({'error':str(error)}, 400)
            return
        if self.path == '/api/frame-exports' or self.path.startswith('/api/frame-exports/'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                parts = self.path.split('/')
                if self.path == '/api/frame-exports':
                    if not 44 <= length <= 256*1024*1024:
                        raise ValueError('The audio mix must be under 256 MB.')
                    metadata = json.loads(self.headers.get('X-Cutline-Export', '{}'))
                    body = self.rfile.read(length)
                    if len(body) != length:
                        raise ValueError('Incomplete audio mix.')
                    self.api_json(video_export.begin_frames(metadata, body), 201)
                elif len(parts) == 5 and parts[4] == 'frames':
                    if not 8 <= length <= 64*1024*1024:
                        raise ValueError('Frame batch is too large or incomplete.')
                    body = self.rfile.read(length)
                    if len(body) != length:
                        raise ValueError('Incomplete frame upload.')
                    self.api_json(video_export.append_frames(parts[3], int(self.headers.get('X-Cutline-First-Frame', '-1')), body))
                elif len(parts) == 5 and parts[4] == 'finish':
                    finished = video_export.finish_frames(parts[3])
                    self.send_response(200)
                    self.send_header('Content-Type', 'video/mp4')
                    self.send_header('Content-Length', str(len(finished)))
                    self.end_headers()
                    self.wfile.write(finished)
                elif len(parts) == 5 and parts[4] == 'cancel':
                    self.api_json({'cancelled':video_export.cancel_frames(parts[3])})
                else:
                    self.api_json({'error':'Unknown export endpoint.'}, 404)
            except (ValueError, OSError) as error:
                self.api_json({'error':str(error)}, 400)
            return
        if self.path.startswith('/api/jobs/') and self.path.endswith('/cancel'):
            job_id = self.path.split('/')[3]
            cancelled = transcription.cancel(job_id)
            self.api_json({'cancelled':cancelled}, 200 if cancelled else 404)
            return
        if self.path == '/api/finalize-video':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 100 <= length <= 256 * 1024 * 1024:
                    raise ValueError('The recording must be smaller than 256 MB for MP4 finishing.')
                mime = self.headers.get('Content-Type', '').split(';')[0]
                if mime not in {'video/mp4', 'video/webm'}:
                    raise ValueError('Choose a browser video recording.')
                data = self.rfile.read(length)
                if len(data) != length:
                    raise ValueError('The recording upload to the local encoder was incomplete.')
                finished = video_export.finalize(data, '.mp4' if mime == 'video/mp4' else '.webm')
                self.send_response(200)
                self.send_header('Content-Type', 'video/mp4')
                self.send_header('Content-Length', str(len(finished)))
                self.end_headers()
                self.wfile.write(finished)
            except (ValueError, OSError) as error:
                self.api_json({'error':str(error)}, 400)
            return
        if self.path != '/api/transcribe':
            self.api_json({'error':'Unknown endpoint.'}, 404)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 44 <= length <= 80 * 1024 * 1024:
                raise ValueError('Choose an audio selection under 80 MB for captions.')
            if not self.headers.get('Content-Type', '').startswith('audio/wav'):
                raise ValueError('Caption preparation requires WAV audio.')
            data = self.rfile.read(length)
            if len(data) != length or data[:4] != b'RIFF' or data[8:12] != b'WAVE':
                raise ValueError('The audio preparation was incomplete. Try again.')
            language = self.headers.get('X-Cutline-Language', 'auto')
            job_id = transcription.submit(data, language)
            self.api_json({'id':job_id}, 202)
        except (ValueError, OSError) as error:
            self.api_json({'error':str(error)}, 400)
    def do_GET(self):
        if self.path.startswith('/api/production/jobs/'):
            if not self.valid_local_request():return
            try:
                parts=self.path.split('/')
                if len(parts)==5:self.api_json(production_jobs.status(parts[4]))
                elif len(parts)==7 and parts[5]=='files':
                    file=production_jobs.artifact(parts[4],int(parts[6]))
                    self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(file.name)[0] or 'application/octet-stream');self.send_header('Content-Length',str(file.stat().st_size));self.end_headers()
                    with file.open('rb') as stream:shutil.copyfileobj(stream,self.wfile)
                else:self.api_json({'error':'Unknown production endpoint.'},404)
            except (ValueError,OSError) as error:self.api_json({'error':str(error)},400)
            return
        if self.path.startswith('/api/'):
            if not self.valid_local_request():
                return
            if self.path == '/api/capabilities':
                self.api_json({'production':production_jobs.available(), 'transcription':transcription.available(), 'engine':'Whisper local', 'mp4_finishing':video_export.available(), 'frame_export':video_export.available(), 'video_check':video_export.available()})
            elif self.path.startswith('/api/jobs/'):
                job = transcription.status(self.path.split('/')[3])
                self.api_json(job or {'error':'Transcription job not found.'}, 200 if job else 404)
            else:
                self.api_json({'error':'Unknown endpoint.'}, 404)
            return
        if self.path == '/__cutline_health__':
            body = MARKER.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, *args):
        pass

def open_editor(url):
    if Path('/Applications/Google Chrome.app').is_dir():
        subprocess.Popen(['/usr/bin/open', '-a', 'Google Chrome', url])
    else:
        webbrowser.open(url)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4178, help='Preferred loopback port')
    parser.add_argument('--open', action='store_true', help='Open the editor in your default browser')
    args = parser.parse_args()
    for port in range(args.port, args.port+21):
        url = f'http://127.0.0.1:{port}'
        try:
            with urlopen(url + '/__cutline_health__', timeout=.3) as response:
                existing = response.read(128).decode() == MARKER
            if existing:
                print(url, flush=True)
                if args.open:
                    open_editor(url)
                return
        except Exception:
            pass
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=str(ROOT / 'dist')))
            break
        except OSError:
            continue
    else:
        raise SystemExit('Ports 4178–4198 are busy. Close an older Cutline window and try again.')
    print(f'Cutline Studio is ready: {url}', flush=True)
    state_root=Path(os.environ.get('CUTLINE_STATE_DIR', str(ROOT/'output')))
    state_root.mkdir(parents=True, exist_ok=True)
    (state_root / 'server.json').write_text(json.dumps({'url': url, 'port': port}))
    if args.open:
        open_editor(url)
    try:
        server.serve_forever(poll_interval=.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
