# Third-party components

Cutline's original application source is MIT licensed. It includes no CapCut code, proprietary CapCut assets or customer footage. Components below keep their own licenses; MIT does not replace them. Users supply media and must have permission to use it.

## Mac release 2.1.0

The downloadable Apple Silicon app contains:

- **Electron 44.9.0 / Chromium**: Electron MIT plus Chromium and third-party notices retained in the app bundle (LICENSE and LICENSES.chromium.html).
- **Python 3.9.6**: Python Software Foundation License and bundled dependency notices. PyInstaller 6.22.3 uses GPL with its bootloader exception, permitting distribution of packaged applications under their own licenses. Runtime notices are retained in the frozen service.
- **Node.js 26.3.0**: Node MIT and bundled component notices, included as `mcp-runtime/NODE-LICENSE.txt`.
- **whisper.cpp** commit `592feef04a1802b18cbeffd0fd0eb5d02570c2ec`: MIT. The release uses a statically linked ARM64 engine with embedded Metal kernels; no separately installed engine is needed.
- **Whisper large-v3-turbo q5_0 model**: converted OpenAI Whisper weights, MIT. Source: [ggerganov/whisper.cpp model repository](https://huggingface.co/ggerganov/whisper.cpp), originating from [OpenAI Whisper](https://github.com/openai/whisper). OpenAI and whisper.cpp MIT notices are included under Resources/licenses. Model SHA-256 and exact build revisions are in Resources/provenance.json.
- **FFmpeg n7.1.5 with x264** commit `b35605ace3ddf7c1a5d67a2eb553f034aef41d55`: GPLv2-or-later. The executable runs as a separate process; Cutline does not link FFmpeg libraries into its own code. License texts, exact corresponding source archives and the full build recipe accompany the release. No nonfree FFmpeg components are enabled. [FFmpeg](https://ffmpeg.org) and [x264](https://www.videolan.org/developers/x264.html) retain their copyrights.
- **@modelcontextprotocol/sdk 1.32.1**, **Zod 4.6.7** and **@napi-rs/canvas 1.0.11**: MIT, with their dependencies' notices included in installed npm package directories. Canvas includes Skia and other upstream components under their respective licenses. The package-lock records the complete dependency graph.

[Release assets and corresponding tool source archive](https://github.com/ayoubahajji/cutline-studio/releases/tag/v2.1.0) · [Rebuild instructions](docs/RELEASE_BUILD.md)

The app has no subscription or required transcription service. A separately chosen MCP AI client may have its own charges and data policy. Bundled software is supplied under its applicable warranty terms.

## Running from source

The browser editor uses Python's standard library. Install your own FFmpeg and optional Whisper engine/model; each selected build retains its licenses. `jsdom` is test-only. Electron and PyInstaller are build dependencies. No compiled binaries, speech weights, private media or personal project files are committed to the source repository.
