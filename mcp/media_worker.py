"""Reuse Cutline's source verification and optional Whisper without an HTTP server."""
from pathlib import Path
import json,sys,time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import video_export,transcription

def main():
    request=json.load(sys.stdin);action=request['action']
    if action=='zip':
        import zipfile
        target=Path(request['path'])
        with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as archive:
            for item in request['files']:
                file=Path(item)
                archive.write(file,file.name)
        with zipfile.ZipFile(target) as archive:
            if archive.testzip():raise ValueError('Delivery archive failed integrity verification')
        return {'path':str(target),'files':len(request['files'])}
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
