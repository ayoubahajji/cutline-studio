# Quality check — 19 October 2026

The Mac application was rebuilt, installed and reopened after the checks below. Its signature passed strict verification, and all installed editor files matched the tested source.

## Issues fixed during this check

- Autosave now reports failure when device storage is unavailable, a write fails, or newer edits arrive before the write completes. Desktop closing keeps the window open and explains how to save a portable backup instead of silently discarding those changes.
- Reload waits for the same save/export checks as closing.
- A stalled renderer no longer leaves the close request permanently pending. After 30 seconds, the window remains open with a recovery message. Unsolicited close acknowledgments are ignored.
- Quitting during backend discovery cannot spawn an orphan local engine.

## Passed

- Editor model and integrated UI logic: independent audio selection and trimming, drag/drop import, silence detection/removal, waveform range cut/keep, multi-selection, grouped actions, locks, undo/redo, video stacking, proportional preview resizing, fit/fill, and compositor ordering.
- Persistence: portable save snapshots, autosave revision ordering, failed storage transactions and unavailable storage.
- Desktop lifecycle: engine startup/recovery, engine ownership, startup cancellation, queued project handoff, save-before-close/reload, active export protection, unresponsive renderer handling and IPC sender validation.
- Real FFmpeg export: 1,818 encoded and decoded moving frames over 60.6 seconds, with matching audio duration within AAC padding tolerance. Incomplete/out-of-order uploads and cancellation were checked.
- Source/output validation: shorter picture tracks, baked-in frozen tails and unexpected frozen final scenes are rejected; intentional still cards remain supported.
- Actual packaged service: ran without external tools on PATH; accepted frames through HTTP, delivered a three-scene MP4, decoded all 180 frames and verified the moving final scene. This used temporary synthetic assets and a separate temporary service instance.
- Installed app: clean restart, local service readiness, strict signing verification and source/package parity.

## Limits

This check used automated DOM/event tests, native lifecycle mocks and real packaged encoder/API tests. A visual desktop editing session and the user's particular frozen export/project were not inspected. Codec support, unusual files, large projects and future edits still need their own checks; these results do not guarantee that every possible error has been eliminated.

Reproduce with `npm run check`, `npm run check:desktop`, `npm run check:encoder`, and on macOS after building, `python3 tests/packaged-service.py`.

## MCP addition checked on the same date

The new 18-tool MCP interface passed actual stdio and authenticated Streamable HTTP client tests, including tool/resource discovery, atomic rollback, stale revision rejection, concurrent writes, track locks, undo, selected-only silence removal, subtitle import, portable project reopen, native PNG compositing/pixel placement, verified 180-frame MP4 and audible WAV output. A separate 60.6-second native renderer regression decoded all 1,818 frames through wipe/slide scene boundaries, refused source overrun and verified cancellation cleanup. The check caught and fixed a cancelled FFmpeg encoder remaining alive. Cross-client job polling/cancellation and interrupted-process reporting also passed.

The managed runtime was installed independently of Downloads, registered as `cutline_studio`, and exercised through a real MCP client with external executables absent from PATH. Its tool code matches the tested source. The personal editing skill passed validation. Optional Whisper transcription was availability-checked, not a speech-accuracy benchmark. Native Skia font metrics/audio presets may differ from the browser; the MCP operates on saved projects rather than live desktop autosave.

## App/MCP feature parity update — 20 October 2026

Added the shared voiceover replacement workflow (mute source sound, optionally clean pauses/keep music/clear stale captions), unused-footage extension to narration, short/balanced caption formatting, and top/bottom text-blur presets. Four named MCP tools expose the same operations; the installed server now advertises 22 tools. Existing crop/scale/position are preserved by these workflows. Added footage uses contain to retain the full frame.

Blur regions now have an interior drag target and eight independent edge/corner handles. Automated pointer-event tests cover movement, independent dimensions, clamping, one-step undo, cancellation, keyframes, locks and export hiding. The real MCP workflow test checks sound replacement, silence removal, music preservation, footage extension, caption words/timing, presets/resizing, pixelation retention, undo and native previews. Editor, desktop lifecycle and MCP suites passed. This does not claim a manual visual desktop test.

The Mac app was rebuilt, installed through its normal save/quit flow and reopened; strict code signing and installed-source parity passed. HTTP checks confirm the running installed app serves the updated scripts. The user's blur-instead-of-crop preference was saved in their Cutline editing skill; previously delivered videos were left unchanged.

## Apple Silicon community release 2.1.0 — 20 October 2026

Hardware: **Apple M1, 8 GB RAM, macOS 26.6.1**. The minimum declared OS is macOS 13.5 because that is the bundled Node runtime's deployment target. Other macOS releases and M2–M5 hardware were not separately exercised. This is an ad-hoc signed, non-notarized community build.

The full editor, desktop lifecycle and 22-tool MCP suites passed after the shared workflow and packaged-worker changes. The released encoder is a custom FFmpeg **n7.1.5** build with x264 and system zlib. Both encoder suites passed against that exact binary, including 1,818-frame / 60.6-second exports, transitions, cancellation cleanup, source overrun, short picture tracks and frozen-tail detection.

A real speech WAV was transcribed successfully by the bundled Whisper engine/model through the frozen Python worker with a fresh HOME and `PATH=/nonexistent`. The local model was checked against its pinned upstream SHA-256. Native canvas Rust crate archives were verified against their SBOM checksums; dependency notices and exact corresponding codec/tool sources are retained for release. A dependency scan of 51 native media/MCP files found no references to developer-installed libraries (Mach-O self-identifiers are not dependency links).

A clean-environment MCP package smoke check also passed using only the bundled Node, frozen Python worker and FFmpeg: 22-tool handshake, capabilities, media import, project edit, caption text, source check, native PNG preview and a verified 60-frame MP4. That check does not access desktop browser storage or private media.

The final release bundle passed the packaged HTTP service test (three-scene MP4 with a moving final scene; 180/180 decoded frames) and the full clean-environment MCP check including real Whisper transcription. App version/minimum OS metadata, 14 desktop/MCP source files and the bundled model checksum matched the tested source/provenance. The generated DMG was mounted read-only and its app copied into a separate temporary install location. That copy passed strict signature verification and repeated the clean-environment MCP/import/preview/60-frame export test. The DMG and corresponding source archive have SHA-256 checksums in the release.

These are clean-environment/package checks on the same physical Mac, not factory-reset testing across every Mac or a manual visual audit of every desktop interaction. Gatekeeper's first-open flow is documented because the build is not notarized. The existing user's live editor project was not opened or overwritten during release testing.

## Production finishing 2.2.0 — 21 October 2026

Added six tools to the MCP (28 total) with app controls: original/imported background music, media inspection, contact sheets, voice LUFS/true-peak measurement and balancing, exported-MP4 verification, and complete delivery ZIP. MP4 defaults to an undoable 7% music bed when music is absent; the app has an opt-out. Replacing built-in music reuses the source. Native app exports use the same engine and copy only referenced media.

The editor, desktop, MCP, full encoder and native compositor suites passed. New real-engine tests verify 7% music settings, exact timeline ending, undo/redo, measured voice balancing, labeled PNG contact sheets, complete MP4 frame counts, ZIP integrity, checksums and monotonic progress below 100 until success. Pixel tests confirm opaque Gaussian blur at the top edge and unchanged pixels outside the region. Preview and native export share that blur implementation and resolution-scaled pixelation.

A real local HTTP test exercises app → MCP handlers, source ID mapping, completed MP4 download, cross-origin rejection, confined artifact downloads, unsupported-action rejection and cancellation of a confirmed running worker. UI integration tests cover defaults, controls, native export, percentage display, stale-result preservation, failure handling and restored editing state.

The signed community Mac bundle was tested with fresh HOME and PATH=/nonexistent: bundled Node, frozen Python, FFmpeg and all 28 MCP tools worked. A separate packaged app-service test generated a complete 60-frame ad with music at 7%, editable project, subtitles, WAV, previews and checksum report in an integrity-checked ZIP. The actual music mix was measured and remained quiet. This is an ad-hoc community signature, not Apple notarization.

These checks cover tested sources and failure paths; they do not promise that every damaged codec, source recording or creative edit will succeed. Failed verification does not download an incomplete export. Voice balancing reports when the requested LUFS and peak ceiling cannot both be reached without compression.

### Source-review compatibility patch (2.2.1)

The native path preserves the existing explicit source-review flow. A source-validation failure opens the reviewed complete-frame path, where users can replace footage, deliberately accept an intentional still source, or explicitly export only the available picture range. Those explicit exceptions use the already-verified complete-frame encoder. Ordinary native encoder failures never silently fall back or download an incomplete file. UI regression tests cover both routing decisions; the existing actual export tests cover accepted still footage and the explicit safe picture range.
