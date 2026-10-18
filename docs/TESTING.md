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
