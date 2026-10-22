/* New media placement is distinct from moving existing timeline clips. */
type MediaKind = 'audio' | 'video' | 'image';
type VisualTrack = 'video' | 'overlay';
type PlacementTrack = VisualTrack | 'audio';
interface PlacementAsset { type: MediaKind; duration?: number; }
interface PlacementClip { id: string; track: string; start: number; duration: number; layer?: number; }
interface PlacementProject { clips: PlacementClip[]; }
interface PlacementOptions { track?: string; at?: number; playhead?: number; selectedId?: string | null; }
interface MediaPlacement { track: PlacementTrack; start: number; duration: number; layer: number; fit: 'contain' | 'cover'; scale: number; }
const CutlineLayerPlacement = (() => {
 const visual = (c: PlacementClip): boolean => c.track === 'video' || c.track === 'overlay';
 function track(asset: Pick<PlacementAsset,'type'>, requested: string | undefined, clips: PlacementClip[] = []): PlacementTrack {
  if (asset.type === 'audio') return 'audio';
  if (requested === 'video' || requested === 'overlay') return requested;
  if (requested === 'text' || requested === 'blur') return 'overlay';
  return asset.type === 'image' && clips.some(visual) ? 'overlay' : 'video';
 }
 function anchor(project: PlacementProject, playhead = 0, selectedId?: string | null): number {
  const main = project.clips.filter(c => c.track === 'video').sort((a,b) => a.start-b.start);
  const active = main.filter(c => c.start <= playhead && c.start+c.duration > playhead).at(-1);
  if (active) return active.start+active.duration-playhead<.05?active.start:Math.max(0,playhead);
  const selected = main.find(c => c.id === selectedId);
  if (selected) return selected.start;
  if (main.length) return (main.filter(c=>c.start<=playhead).at(-1) || main[0]).start;
  const layers = project.clips.filter(visual);
  if (layers.some(c=>c.start<=playhead && c.start+c.duration>playhead)) return Math.max(0,playhead);
  return layers.find(c=>c.id===selectedId)?.start ?? Math.max(0,playhead);
 }
 function plan(project: PlacementProject, asset: PlacementAsset, options: PlacementOptions = {}): MediaPlacement {
  const sourceDuration=asset.type==='image'?5:(asset.duration??0);
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) throw Error('The media has no readable duration.');
  const destination=track(asset,options.track,project.clips);
  const start=options.at ?? (destination==='overlay'?anchor(project,options.playhead,options.selectedId):Math.max(0,...project.clips.filter(c=>c.track===destination).map(c=>c.start+c.duration)));
  if (!Number.isFinite(start) || start<0) throw Error('Choose a valid timeline position.');
  let duration=Math.min(3600,sourceDuration);
  if (asset.type==='image' && destination==='overlay') {
   const base=project.clips.filter(c=>c.track==='video'&&c.start<=start&&c.start+c.duration>start+.000001).sort((a,b)=>a.start-b.start).at(-1);
   if (base) duration=Math.min(duration,base.start+base.duration-start);
  }
  if(duration<.05) throw Error('Place the image at least 0.05 seconds before the video ends.');
  return {track:destination,start,duration,layer:destination==='overlay'?Math.max(0,...project.clips.filter(c=>c.track==='overlay').map(c=>c.layer||0))+1:0,fit:asset.type==='image'?'contain':'cover',scale:destination==='overlay'&&asset.type==='image'&&project.clips.some(visual)?60:100};
 }
 return {track,anchor,plan};
})();
declare const module: {exports: typeof CutlineLayerPlacement} | undefined;
if (typeof module !== 'undefined' && module.exports) module.exports=CutlineLayerPlacement;
else (globalThis as unknown as {CutlineLayerPlacement: typeof CutlineLayerPlacement}).CutlineLayerPlacement=CutlineLayerPlacement;
