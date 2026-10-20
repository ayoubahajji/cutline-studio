"""Reuse Cutline's source verification and optional Whisper without an HTTP server."""
from pathlib import Path
import json,sys,time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import video_export,transcription

def main():
    request=json.load(sys.stdin);action=request['action']
    if action=='scan':return video_export.inspect_video(Path(request['path']).read_bytes())
    if action=='capabilities':return {'ffmpeg':str(video_export.BINARY or ''),'transcription':transcription.available()}
    if action=='transcribe':
        job=transcription.submit(Path(request['path']).read_bytes(),request.get('language','auto'))
        while True:
            status=transcription.status(job)
            if status['status']=='done':return {'srt':status['srt']}
            if status['status'] in ('failed','cancelled'):raise ValueError(status.get('error','Transcription cancelled'))
            time.sleep(.2)
    raise ValueError('Unknown media operation')
if __name__=='__main__':
    try:print(json.dumps(main()))
    except Exception as error:print(json.dumps({'error':str(error)}));sys.exit(1)
