"""Real FFmpeg regression for video ending early while audio keeps playing."""
from pathlib import Path
import io, math, struct, subprocess, sys, wave
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import video_export as encoder

def track_durations(data):
    found=[]
    def walk(start,end):
        while start+8<=end:
            size,kind=struct.unpack_from('>I4s',data,start)
            if size<8:break
            if kind in [b'moov',b'trak',b'mdia']:walk(start+8,start+size)
            if kind==b'mdhd':
                offset=start+8+(20 if data[start+8] else 12)
                rate=struct.unpack_from('>I',data,offset)[0]
                ticks=struct.unpack_from('>Q' if data[start+8] else '>I',data,offset+4)[0]
                found.append(ticks/rate)
            start+=size
    walk(0,len(data))
    return found

def audio(seconds):
    out=io.BytesIO()
    with wave.open(out,'wb') as writer:
        writer.setparams((1,2,16000,0,'NONE','not compressed'))
        writer.writeframes(b'\0\0'*math.ceil(seconds*16000))
    return out.getvalue()

seconds=60.6;count=1818
raw=subprocess.run([str(encoder.BINARY),'-hide_banner','-loglevel','error','-f','lavfi','-i',f'testsrc2=size=160x90:rate=30:duration={seconds}','-c:v','mjpeg','-q:v','4','-f','image2pipe','-'],check=True,capture_output=True).stdout
images=[];start=0
while start<len(raw):
    end=raw.index(b'\xff\xd9',start)+2
    images.append(raw[start:end]);start=end
assert len(images)==count
job=encoder.begin_frames({'width':160,'height':90,'frames':count},audio(seconds))['id']
try:
    try:encoder.finish_frames(job)
    except ValueError as error:assert 'incomplete' in str(error)
    else:raise AssertionError('Incomplete export was accepted')
    for first in range(0,count,10):
        batch=images[first:first+10];packet=b''.join(struct.pack('>I',len(image))+image for image in batch)
        if first==0:
            try:encoder.append_frames(job,1,packet)
            except ValueError:pass
            else:raise AssertionError('Out-of-order frame batch was accepted')
        result=encoder.append_frames(job,first,packet)
        assert result['received']==first+len(batch)
    finished=encoder.finish_frames(job)
    durations=track_durations(finished)
    assert len(durations)==2,durations
    assert abs(durations[0]-seconds)<1/30,durations
    assert abs(durations[1]-seconds)<.1,durations
    target=Path(__file__).resolve().parents[1]/'output/frame-export-regression.mp4';target.write_bytes(finished)
    decoded=subprocess.run([str(encoder.BINARY),'-hide_banner','-loglevel','error','-i',str(target),'-map','0:v:0','-f','null','-','-progress','pipe:1'],capture_output=True,text=True,check=True)
    assert f'frame={count}\n' in decoded.stdout,decoded.stdout[-400:]
    print(f'PASS: {count} real encoded/decoded frames; video {durations[0]:.3f}s; audio {durations[1]:.3f}s; incomplete/out-of-order exports rejected')
finally:encoder.cancel_frames(job)
job=encoder.begin_frames({'width':160,'height':90,'frames':30},audio(1))['id'];assert encoder.cancel_frames(job);assert job not in encoder._FRAME_JOBS
print('PASS: cancelled frame export terminates encoder and removes temporary session')
