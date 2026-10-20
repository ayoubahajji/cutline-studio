# Testing

## JavaScript and DOM regressions

```sh
npm ci
npm run check
```

Checks include syntax, source offsets, animation/fade retiming, splits/trims, SRT/VTT parsing, independent selection, Finder/library drops, group actions, preview geometry, stacking order, waveform range editing, silence removal, asynchronous save/normalization races, caption locks, stereo waveforms, and source-review behavior.

Integrated tests use jsdom with synthetic media and simulated browser events. These are not substitutes for real browser/codec testing.

## Real encoder regressions

Install FFmpeg with H.264/AAC and set `CUTLINE_FFMPEG_BINARY` if it is not on PATH:

```sh
npm run check:encoder
```

The suite generates 1,818 moving frames for a 60.6-second export, decodes the result, and verifies frame count and video/audio duration. It also checks incomplete/out-of-order rejection, cancellation cleanup, a video track shorter than its audio, an encoded frozen tail, and rejection of an unexpected frozen final scene. Intentional still-image output remains allowed.

Generated fixtures stay under ignored `output/` or temporary directories. No personal media is needed.

## Manual checks before a release

Test import, play/pause, seeking, overlapping layers, audio range editing, silence removal, undo/redo, track locks, portable save/reopen, cancellation, and a complete exported file in a desktop browser. Include a final scene with visible motion and listen to the final audio. Report the browser and operating system used; do not claim an untested codec or platform is supported.

## Optional GitHub Actions

`ci.github-actions.yml` is a complete workflow template for the checks above on Ubuntu with Node 22, Python 3.11, and FFmpeg. It is provided as a template rather than an active workflow because the publishing sign-in cannot upload workflow files. With suitable GitHub permissions, copy it to `.github/workflows/ci.yml` in your fork or repository.

## Desktop application

`npm run check:desktop` checks main/preload/bridge syntax, same-origin backend startup and crash recovery, ownership-safe reuse of existing engines, queued project opening after restore, and autosave/export handling before closing. Native build/signing requires macOS. Verify the installed bundled backend with system executables absent from PATH, and check that recovery does not reload the renderer or reset its timeline. Desktop and browser IndexedDB are intentionally separate; transfer with a portable `.cutline` file rather than reading or copying a live browser profile.

`npm run check:desktop` also verifies save failures, save-before-reload, a nonresponsive renderer, sender checks and quit-during-discovery cancellation. After building, run `python3 tests/packaged-service.py` to exercise the bundled service through its HTTP API with a three-scene MP4 and no external executables on PATH. Pass an alternate `.app` path as its first argument to check an installed build. It uses temporary synthetic media and never opens user projects.

## MCP/headless editing

`npm run check:mcp` exercises the actual MCP stdio/Streamable HTTP protocols, revisions/atomic rollback, concurrent clients and cancellation, import/portable reopen, caption and silence edits, overlay pixel placement, image previews, verified MP4/WAV exports and audible output samples. `npm run check:mcp:encoder` renders and decodes 1,818 native compositor frames across a 60.6-second timeline, exercises wipe/slide boundaries, cancels a render and rejects source overrun. Set `CUTLINE_TEST_MCP_RUNTIME` to a managed runtime directory when running `tests/mcp-integration.cjs` to check the installed copy with external executables absent from PATH. See [MCP setup](MCP.md) for limits and instructions.

The MCP regressions also cover late source ranges in 24 kHz voiceovers after silence removal, caption timestamps that overrun the narration, and fractional video source/timeline cuts. Audio is decoded then trimmed in the filter graph rather than fast-seeking WAV inputs; this avoids losing later voice segments. Native video decoders retain a small frame-boundary read margin while the compositor still stops at the exact clip end.

`tests/blur-workflows-ui.cjs` exercises actual DOM pointer events and the app's new workflow controls, including blur handles, undo/cancel, keyframes and locks. `tests/mcp-workflows.cjs` calls all four matching workflows through the real MCP protocol and checks that source framing and caption words/timing are preserved. Both are included in the standard editor/MCP check commands.

## Self-contained Mac release

After `desktop/prepare-release.py` and `desktop/build.py --release`, run:

```sh
python3 tests/packaged-service.py '.desktop-build/Cutline Studio.app'
'.desktop-build/Cutline Studio.app/Contents/Resources/mcp-runtime/bin/node' tests/packaged-release.cjs '.desktop-build/Cutline Studio.app' /path/to/short-speech.wav
```

The release test creates a fresh HOME, removes developer tools from PATH and exercises the real stdio server, bundled media worker, captions/preview and MP4 export. The optional speech argument exercises actual local Whisper transcription; without it the model's availability is checked. For a disk-image release, mount the DMG, copy its app to a temporary install directory, verify its signature and rerun these checks on that copy. Never use private customer media as release-test fixtures.
