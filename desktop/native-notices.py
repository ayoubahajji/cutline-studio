#!/usr/bin/env python3
"""Retain license texts and exact Rust crate sources from the canvas SBOM."""
from pathlib import Path
import base64,concurrent.futures,hashlib,io,json,os,re,tarfile,urllib.request
ROOT=Path(__file__).resolve().parents[1]
DEST=Path(os.environ.get('CUTLINE_RELEASE_DEPS',str(Path.home()/'.cache/cutline-release-arm64')))
def download(url):
    with urllib.request.urlopen(url,timeout=90) as response:return response.read()
def main():
    sbom=ROOT/'node_modules/@napi-rs/canvas-darwin-arm64/sbom.cdx.json'
    components=json.loads(sbom.read_text())['components']
    crates=DEST/'crate-sources';crates.mkdir(exist_ok=True,parents=True)
    def collect(item):
        name,version=item['name'],item.get('version')
        if not item.get('purl','').startswith('pkg:cargo/') or name=='canvas':return ''
        file=crates/(name+'-'+version+'.crate')
        if not file.exists():file.write_bytes(download('https://static.crates.io/crates/'+name+'/'+name+'-'+version+'.crate'))
        expected=next((h['content'] for h in item.get('hashes',[]) if h['alg']=='SHA-256'),None)
        if expected and hashlib.sha256(file.read_bytes()).hexdigest()!=expected:raise ValueError('Crate checksum mismatch: '+name)
        texts=[]
        with tarfile.open(file) as archive:
            for entry in archive:
                basename=Path(entry.name).name.lower()
                if entry.isfile() and entry.size<400000 and any(word in basename for word in ['license','copying','copyright','notice']):
                    texts.append('\n--- '+entry.name+' ---\n'+archive.extractfile(entry).read().decode('utf8',errors='replace'))
        return '\n\n## '+name+' '+version+'\nSource: https://crates.io/crates/'+name+'/'+version+'\n'+''.join(texts)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:texts=list(pool.map(collect,components))
    notices=DEST/'licenses';notices.mkdir(exist_ok=True)
    (notices/'CANVAS-RUST-NOTICES.txt').write_text('Native canvas dependency sources are included in the release source archive.\n'+''.join(texts))
    sha='95ee33d7ec7791ab9c071675710a14fe6408ae4f'
    (notices/'SKIA-BSD-LICENSE.txt').write_bytes(download('https://raw.githubusercontent.com/google/skia/'+sha+'/LICENSE'))
    deps=download('https://raw.githubusercontent.com/google/skia/'+sha+'/DEPS').decode()
    texts=[]
    for name,source in re.findall(r'"third_party/externals/([^"/]+)"\s*:\s*"([^"\n]+)"',deps):
        if name not in ['expat','freetype','harfbuzz','icu','icu4x','libjpeg-turbo','libpng','libwebp','wuffs','zlib']:continue
        url,revision=source.rsplit('@',1)
        listing=download(url+'/+/'+revision+'/?format=JSON').decode()
        entries=json.loads(listing[listing.index('\n')+1:])['entries']
        files=[e['name'] for e in entries if e['type']=='blob' and re.search('license|copying|copyright|patents',e['name'],re.I)]
        if name=='freetype':files+=['docs/FTL.TXT','docs/GPLv2.TXT']
        if name=='libjpeg-turbo':files+=['README.ijg']
        if name=='zlib' and not files:files+=['README']
        if not files:raise ValueError('No upstream license found: '+name)
        for file in sorted(set(files)):
            content=base64.b64decode(download(url+'/+/'+revision+'/'+file+'?format=TEXT')).decode('utf8',errors='replace')
            texts.append('\n--- '+name+'/'+file+' ---\nSource: '+source+'\n'+content)
    (notices/'SKIA-THIRD-PARTY-NOTICES.txt').write_text('\n'.join(texts))
    (notices/'CANVAS-SBOM.json').write_bytes(sbom.read_bytes())
    print('Collected native canvas SBOM dependencies:',len(components),'; Skia notice files:',len(texts))
if __name__=='__main__':main()
