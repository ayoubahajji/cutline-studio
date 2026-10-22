/* Explicit layer/sequence insertion beside drag-and-drop. */
const libraryBeforeLayerActions=renderLibrary;
renderLibrary=function(){
 libraryBeforeLayerActions();
 if(!['media','overlays'].includes(tab))return;
 for(const card of $$('[data-asset],[data-layer-asset]',$('#library-content'))){
  const id=card.dataset.asset||card.dataset.layerAsset,a=assets.get(id);if(!a||a.type==='audio')continue;
  const wrapper=document.createElement('div');wrapper.className='asset-entry';card.replaceWith(wrapper);wrapper.append(card);
  const actions=document.createElement('div');actions.className='asset-placement-actions';
  const layer=document.createElement('button');layer.type='button';layer.textContent='＋ Layer';layer.title='Place above the video at the playhead';layer.dataset.insertLayer=id;layer.disabled=exporting||project.locked.overlay;layer.onclick=()=>addOverlay(id);
  const sequence=document.createElement('button');sequence.type='button';sequence.textContent='Append';sequence.title='Add to the end of the main video';sequence.dataset.appendSequence=id;sequence.disabled=exporting||project.locked.video;sequence.onclick=()=>addAsset(id,undefined,'video');
  actions.append(layer,sequence);wrapper.append(actions);
  card.title=(card.dataset.layerAsset||CutlineLayerPlacement.track(a,undefined,project.clips)==='overlay')?'Add as a layer over the video':'Append to the main video';
 }
};
