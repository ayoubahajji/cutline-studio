# Architecture

The browser owns the editable project, imported Blob URLs, preview canvas, timeline selection, and IndexedDB autosave. The loopback Python service serves static files and runs optional local media processes.

- `dist/app.js`: core project state, import, base inspector, playback and persistence.
- `dist/editor-model.js`: pure source/timeline math, splitting, retiming, audio range slicing, and subtitle parsing.
- `dist/enhanced.js`: layers, region effects, audio routing/offline mix, captions, keyframes and track locks.
- `dist/timeline-interactions.js`: selection, trimming, group dragging and file drops.
- `dist/multi-selection.js`, `dist/video-stacking.js`: batch actions and visual layer order.
- `dist/frame-geometry.js`, `dist/preview-transform.js`: shared compositing geometry and direct preview handles.
- `dist/audio-editing.js`, `dist/audio-workspace.js`, `dist/audio-desk.js`: silence analysis and waveform editing.
- `dist/source-check.js`, `dist/source-review.js`: source-range validation and review before export.
- `dist/export-frames.js`, `dist/precise-export.js`: decoded frame readiness and exact frame export.
- `serve.py`: loopback HTTP service; local-origin API checks.
- `video_export.py`: FFmpeg probing, ordered frame sessions, encoding and output validation.
- `transcription.py`: optional whisper.cpp job management.
- `launch.py`: managed macOS session service deployment; portable foreground startup is `serve.py`.

Scripts are loaded in explicit order and some extend existing functions. Large architectural changes should preserve integrated tests and document changes to that order. Project edits should be undoable and obey locks; temporary preview/export state should not silently alter the project.

## Desktop and MCP

`desktop/main.cjs` owns the Electron window, safe save/close flow and MCP configuration menu. `desktop/backend.cjs` supervises the loopback engine and recovers its original port. The preload bridge keeps Node out of the renderer. `desktop/service.py` freezes both the HTTP service and JSON media worker into one executable, so released MCP clients do not require system Python.

`mcp/store.cjs` provides revision-checked durable projects, copied media, undo/redo and atomic edits. `mcp/tools.cjs` exposes the editing surface; `mcp/workflow-tools.cjs` uses the shared `dist/editing-workflows.js` planning functions. `mcp/render.cjs` composites through native Skia and pipes every frame to FFmpeg; `mcp/media.cjs` handles decoders, audio and the frozen worker. Stdio and authenticated loopback Streamable HTTP share the same project store.

Release layout: `Resources/backend` contains the frozen Python service and bundled tools/model; `Resources/mcp-runtime` contains Node, production dependencies, MCP source and shared editor modules. All executable/model paths resolve relative to the bundle rather than a developer's home. See [release builds](RELEASE_BUILD.md).
