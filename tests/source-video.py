"""Real-video regressions for truncated sources, baked freezes, and stalled rendering."""
from pathlib import Path
import io,struct,subprocess,sys,tempfile,wave
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import video_export as encoder

def wav(seconds):
    b=io.BytesIO()
    with wave.open(b,'wb') as w:
        w.setparams((1,2,16000,0,'NONE','none'));w.writeframes(b'\0\0'*int(seconds*16000))
    return b.getvalue()

def run(*args):return subprocess.run([str(encoder.BINARY),'-hide_banner','-loglevel','error',*args],capture_output=True,check=True).stdout
with tempfile.TemporaryDirectory() as directory:
    source=Path(directory)/'audio-longer.mp4'
    run('-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=2','-f','lavfi','-i','sine=frequency=300:duration=5','-c:v','libx264','-c:a','aac','-y',str(source))
    report=encoder.inspect_video(source.read_bytes());assert abs(report['videoDuration']-2)<.05,report
    frozen=Path(directory)/'frozen.mp4'
    run('-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=2','-vf','tpad=stop_mode=clone:stop_duration=4','-c:v','libx264','-y',str(frozen))
    report=encoder.inspect_video(frozen.read_bytes());assert abs(report['videoDuration']-6)<.05,report
    assert any(f['start']<2.1 and f['end']>5.9 for f in report['frozen']),report
    print('PASS: actual 2s picture track is distinguished from 5s audio; a baked-in 4s frozen tail is detected')
    jpeg=run('-f','lavfi','-i','color=blue:size=160x90','-frames:v','1','-c:v','mjpeg','-f','image2pipe','-')
    for moving in [True,False]:
        job=encoder.begin_frames({'width':160,'height':90,'frames':90,'checkMovingTail':moving},wav(3))['id']
        try:
            for first in range(0,90,10):encoder.append_frames(job,first,(struct.pack('>I',len(jpeg))+jpeg)*10)
            try:result=encoder.finish_frames(job)
            except ValueError as e:
                assert moving and 'final scene stopped changing' in str(e),str(e)
            else:
                assert not moving,'Stuck output was downloaded despite a moving source expectation'
                assert encoder.inspect_video(result)['frames']==90
        finally:encoder.cancel_frames(job)
    print('PASS: unexpected frozen final scene is rejected; intentional still-image exports remain allowed')
