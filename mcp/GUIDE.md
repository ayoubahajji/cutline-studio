# Cutline Studio: tool-driven editing

This is a local editing engine with standard MCP stdio and authenticated loopback Streamable HTTP transports. It uses Cutline's pure timeline model, frame geometry, subtitle parser, silence detector and source verification code; a Skia 2D compositor and FFmpeg replace the browser during headless rendering. It does not inspect or drive a browser or read a live desktop profile.

## Working model

1. Read `cutline_capabilities` for available tools and the local Whisper status. Read/list a project, or create one. Import chosen media files by absolute path. Import copies files; originals remain unchanged.
2. Read `cutline_project_get`. Every mutation needs its current `expectedRevision`; stale writes fail. `cutline_project_edit` applies an entire batch atomically with one undo step. The returned `result` contains created clip IDs. Use `cutline_history` for undo/redo.
3. Preview representative times with `cutline_preview`. The tool returns an inspectable PNG image and file path. Inspect opening, text readability, layer positions, transitions and final scene.
4. Run `cutline_source_check`. If it reports missing pictures or frozen source footage, shorten/replace the affected clip. Only mark `allowStillAssetIds` when the source is intentionally static. Never silently accept a freeze or trim the whole project.
5. `cutline_render` starts a background export. Poll `cutline_job`; `status: done` plus a result path means the artifact is ready. Failed/cancelled jobs are not completed exports. Rendering uses an immutable revision snapshot, so later edits do not alter it. Job status survives a process restart; unfinished jobs become interrupted rather than claiming success.
6. Save a portable project with `cutline_project_save`. It embeds media in the existing `.cutline` format; `openInApp: true` uses the normal Mac document-opening path. Existing desktop work must first be saved to `.cutline` and then imported with `cutline_project_open`. The active desktop timeline is separate.

## Time, geometry and ordering

- `start` and `duration` are timeline seconds. `in` is the source offset in seconds. Speed is source seconds per timeline second. Updating speed retimes duration, fades and keyframes with the same model as the editor. If you want a fixed output duration, specify that in the same update or trim afterward.
- `trim` and `range` `from/to` are offsets within the current clip, in timeline seconds. `split.time` is an absolute timeline time. Keep at least 0.05 seconds in each fragment.
- `trim` preserves a slice at its original timeline location. `range` with `keep:false` removes a section and closes the gap within that clip; other clips/tracks stay put. `delete.ripple:true` shifts later content on the affected tracks.
- `x/y` are percentages relative to the canvas center: 0/0 is centered, x=25 is a quarter-canvas to the right. Positive y is downward. `scale`, opacity, crops, and blur width/height are percentages. Rotation is degrees. Crop percentages refer to original source edges. `fit:cover` fills the canvas (cropping if necessary); `contain` shows the whole source.
- Main video: latest-starting active clip wins; its transition can reveal the previous active clip. Transitions require actual overlap. For a 0.5-second dissolve, overlap two clips by 0.5 seconds and set the incoming clip's `transition:dissolve, transitionDuration:0.5`. Wipe and slide use the same rule.
- Visual order is main video, overlays (higher `layer` on top), blur regions, then text/captions. Main clips are ordered by start; overlay stacking is explicit.
- Ratios: 9:16, 16:9, 1:1, 4:5. Export `height` determines the real raster height; width follows the ratio and rounds to an even integer. A 9:16 export at height 1920 is 1080×1920. Preview at 720 or below for quick inspection. MP4 is 30 fps H.264/AAC.

## Tool and operation map

- Projects: create/list/get/edit/history; portable open/save. Track mute/visibility and locks are controlled by `configure.muted` and `configure.locked`; locked clips cannot be edited until explicitly unlocked.
- Media: `cutline_media_import`, then `add` with asset ID, track, timing, source in/speed and optional patch. Imported images default to five seconds. `video`/`overlay` can show images or videos; `audio` requires an audio stream.
- Arrangement: `update` accepts multiple clip IDs; split, trim, range keep/delete, duplicate, delete/ripple, detach audio. Moving a visual between main and layers uses `update.patch.track`; set `layer` to control stacking. Detach makes an independent audio clip and mutes that video's embedded sound.
- Visuals: patch fit, scale, x/y, rotation, flipX/Y, cropLeft/Right/Top/Bottom, opacity, brightness/contrast/saturation, filter (none/warm/cool/mono/vintage/vivid), motion zoom, fades and transition. `keyframes` replaces the clip's transform frames; times are local to the clip and interpolation is linear. Provide all intended pose values at each keyframe for predictable motion.
- Blur: add a `blur` operation with timing, x/y and width/height. Mode is blur or pixelate. It covers the already-composited video and overlays; captions added by the editor draw afterward and remain readable.
- Text: `text` creates editable text or captions with timing and style. Font size uses a 1080-height design scale, independent of render size. Styles include weight, fill, background/opacity, stroke, shadow, position and transform. Captions default near y=31. Native Skia font rasterization can differ from browser canvas; preview multilingual text. The renderer does not promise identical font metrics on other machines.
- Captions: import SRT/VTT, export SRT, or generate with the existing local Whisper installation. Generation mixes the project audio and returns a background job. If the project changed during transcription, the SRT is retained and the stale write is reported; import that SRT against the new revision. No model download or cloud upload is automatic.
- Audio: patch volume (0–200%), gainDb, role (voice/music/other), preset (original/voice/telephone/bass), fades, speed, audioMuted, and music ducking. Ducking lowers the clip to 25% during another audible voice-role clip. Presets use native FFmpeg approximations of the editor's audio processing, so listen to the result before delivery. The final mix is limited to avoid clipping.
- Silence: first call `cutline_audio_silence` with apply=false, then apply=true against the same unchanged revision after reviewing the plan. It shares the editor's stereo RMS detector, preserves padding and source in/out, compacts only that clip, and keeps loadable fragment durations. An all-silent clip is never deleted implicitly.
- Normalization: `cutline_audio_normalize` measures sample peaks in the selected source range and changes gain only. It does not rewrite source files. Final fades/mixing can change the resulting loudness.
- Rendering: preview PNG, mix WAV, render MP4, inspect/cancel jobs. MP4 delivery checks complete frame count, decoded picture duration and an unexpected frozen tail when source footage should still be moving. Audio-only projects can export WAV or a background-only MP4.

## Ecommerce editing decisions

Use the user's requested creative brief and claims. When useful, build a product-first hook, short readable captions, supporting close-up layers, clean narration, quiet music with ducking, and a clear call to action. Keep text and key product details away from social UI overlays. Do not add unsupported product claims or assume a business-specific template without authorization.

Save both the final video and editable project when delivering an edit. If tools are not yet visible in the current chat, use the SDK client helper in this repository or start a fresh Codex chat after registering the server. Do not claim access to live desktop autosave or advertise untested feature parity.

## Shared app and MCP workflows

The Audio and Ad tools tabs include Voiceover edit controls: choose/import narration, replace the original soundtrack, optionally remove pauses/keep music/clear old captions, extend selected footage to the narration, and open auto captions. Captions includes Short, balanced captions. Ad tools includes top/bottom text blur presets. Each action is undoable.

- `cutline_replace_voiceover`: atomically mute source-video sound, replace voice/audio clips, optionally preserve music, clear stale captions and remove quiet gaps. Existing video crop/position/scale are untouched. Generate captions afterward with `cutline_captions_generate`.
- `cutline_fit_footage`: extend the main track with unused source ranges to the narration end. Select source asset IDs. Repetition requires explicit `reuse:true`; added clips use contain and never introduce cropping to hide text. It does not shorten an existing longer cut.
- `cutline_captions_format`: split timed caption phrases and balance line breaks while retaining words, style and time ranges.
- `cutline_blur_region`: create a top/bottom text band or custom rectangle, or adjust an existing blur by ID. It never changes source framing. Select the region in the app to drag its interior or independently resize any edge/corner. Escape cancels a gesture; Undo restores it; locked tracks cannot be changed. Keyframed blur geometry records changes at the playhead.

Hide unwanted source text with blur when requested. Cropping is a separate framing decision, not a substitute for covering English text.

## Production tools (2.2)

The Audio and Ad tools panels expose the same native production handlers as MCP. The Mac build includes its own Node runtime; no developer installation is required. Browser-only deployments keep the complete-frame fallback exporter when the native engine is unavailable.

- `cutline_background_music`: choose an imported audio asset or the built-in original Bright momentum / Calm horizon instrumentals. Defaults to **7%**, no additional ducking. It loops and ends at the non-music timeline end, adds fades, replaces previous music only when requested, and supports Undo and audio-track locks. Existing narration and framing are untouched. These synthesized instrumentals are generated locally and need no third-party music license.
- `cutline_render`: MP4 now adds an undoable built-in 7% music bed if no music-role clip exists. Set `music:false` for a deliberately music-free export. Existing music keeps the user's settings. WAV exports do not add music. Read the project again after the first automatic music addition before subsequent writes.
- `cutline_media_inspect`: inspect an imported asset's streams, dimensions, duration, optional picture/freeze scan, and measured integrated LUFS / true peak.
- `cutline_contact_sheet`: render exact timeline times into a labeled PNG (up to 24 frames). Use it for narrative and caption review; it does not open or alter the desktop timeline.
- `cutline_audio_loudness`: `apply:false` measures voice-only audio by default; `scope:mix` measures the full mix. `apply:true` applies one uniform gain adjustment to all voice-role audio clips toward -17 LUFS, constrained by a -1 dB peak ceiling and the supported gain range. It reports `targetReached:false` when dynamics prevent reaching both targets without compression. It does not claim to restore distorted source audio.
- `cutline_export_verify`: fully decode an absolute local MP4, check an optional exact frame count, and report picture duration, frozen intervals, LUFS, true peak and SHA-256. Frozen intervals are evidence for review, because an intentional still card can be valid.
- `cutline_delivery_bundle`: one cancellable background job renders and verifies MP4, creates an editable `.cutline`, SRT, mixed WAV, opening/ending previews, measurement/checksum JSON, and an integrity-checked ZIP. Music defaults to 7% if absent; `music:false` opts out. Poll `cutline_job` and deliver only `status:done`.

The app's **Music & finishing** controls include source inspection, voice measurement/balancing, contact sheets, footage checking, exported-MP4 verification and complete delivery ZIP. The export dialog has a default-on music checkbox. Finishing uses the native MCP compositor and a private snapshot copy; live desktop autosave is never read by MCP. App mutations map clip IDs back to the original edit, reject stale results, and create an Undo step.

Job status includes `percent` (0–99 while working, 100 only after successful completion). Export phases include source checking, audio mixing, rendering, verification and packaging. Frame counts remain available for diagnostics; user-facing progress shows percentages. Gaussian blur extends source-edge pixels before filtering, preventing original text from showing through at the frame edge; preview and native export share the renderer.

## Layering and timeline display (2.3)

The media library offers explicit **Layer** and **Append** actions. Clicking a photo when footage exists adds a contained overlay at the playhead; a cursor at the end falls back over the selected/nearest main clip. A photo stops at the base ending by default, without changing the base. Explicit Main-row/Append placement remains sequential. Layers-card dragging retains layer intent, preview drops overlay visual media, and multiple photos dropped as layers share the same time. Audio still routes independently to Audio. Existing clip moves preserve saved transforms and timing.

`cutline_layer_add` shares these typed placement rules: `assetId`, optional `overClipId`, optional exact `at`, and the current revision. It adds to Layers only and never moves/appends the base. Photo defaults are contain/60%; video layers preserve the previous full-frame default. Undo and destination locks apply.

Timeline waveforms now use cached exact stereo min/max peaks with visible-window HiDPI Canvas painting, source trims/speed and fades. Blue/teal channels stay separate; silence is shown as a baseline. Volume/role labels remain separate from source-waveform scaling. Scene strips sample chronological source times through independent paused decoders, with bounded decoder and frame caches. These are Cutline implementations, not recovered CapCut source code.
