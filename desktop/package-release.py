#!/usr/bin/env python3
"""Create the community DMG, exact corresponding tool sources and checksums."""
from pathlib import Path
import hashlib,io,json,os,shutil,subprocess,tarfile,tempfile
ROOT=Path(__file__).resolve().parents[1]
def main():
    version=json.loads((ROOT/'package.json').read_text())['version']
    app=ROOT/'.desktop-build/Cutline Studio.app'
    if not (app/'Contents/Resources/mcp-runtime/bin/node').is_file():raise SystemExit('Build --release first.')
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
    dest=ROOT/'release';dest.mkdir(exist_ok=True)
    dmg=dest/f'Cutline-Studio-{version}-mac-arm64.dmg'
    with tempfile.TemporaryDirectory(prefix='cutline-dmg-') as temp:
        stage=Path(temp)
        subprocess.run(['ditto',str(app),str(stage/'Cutline Studio.app')],check=True)
        (stage/'Applications').symlink_to('/Applications',target_is_directory=True)
        shutil.copy2(ROOT/'docs/MAC_INSTALL.md',stage/'READ ME FIRST.md')
        subprocess.run(['hdiutil','create','-volname','Cutline Studio','-srcfolder',str(stage),'-format','UDZO','-ov',str(dmg)],check=True)
    deps=Path(os.environ.get('CUTLINE_RELEASE_DEPS',str(Path.home()/'.cache/cutline-release-arm64')))
    source=dest/f'Cutline-Studio-{version}-tool-sources.tar.gz'
    with tarfile.open(source,'w:gz') as archive:
        for name in ['ffmpeg','x264','whisper.cpp']:
            raw=subprocess.check_output(['git','archive','HEAD'],cwd=deps/'sources'/name)
            with tarfile.open(fileobj=io.BytesIO(raw)) as upstream:
                for member in upstream:
                    member.name=name+'/'+member.name
                    archive.addfile(member,upstream.extractfile(member) if member.isfile() else None)
        if (deps/'crate-sources').exists():archive.add(deps/'crate-sources',arcname='canvas-crate-sources')
        archive.add(deps/'licenses',arcname='licenses')
        for file in [ROOT/'desktop/prepare-release.py',ROOT/'desktop/native-notices.py',ROOT/'docs/RELEASE_BUILD.md',deps/'provenance.json']:
            archive.add(file,arcname=file.name)
    checks=[]
    for file in [dmg,source]:
        digest=hashlib.sha256()
        with file.open('rb') as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
        checks.append(digest.hexdigest()+'  '+file.name)
    (dest/'SHA256SUMS.txt').write_text('\n'.join(checks)+'\n')
    print('\n'.join(checks))
if __name__=='__main__':main()
