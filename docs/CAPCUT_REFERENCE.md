# CapCut reference study — 22 October 2026

The installed reference is CapCut 9.5.0 (`com.lemon.lvoverseas`). Read-only REA package inspection identified a universal x86_64/arm64 native executable with declared Qt 6.2.2, AVFoundation, CoreAudio and CoreVideo linkage. This is toolkit/package evidence, not a reconstruction of its original source language or timeline algorithms.

REA evidence: `inspect_macho` **ev_76405577ba245e3b539e03ed1898d2dd123751f90784f906123adb174667f794**; `inspect_plist` **ev_8e5712b06bdb0241ca1727315368bcca872cbc322bbb7613299982b39f5cac65**. Native function decompilation was unavailable because no provider was installed. No target execution, live-project access, configuration changes or engine installation occurred.

Official product documentation supplies the behavior reference:

- [Image/video overlays](https://www.capcut.com/resource/free-video-overlay-effects): upper timeline track overlapping the base footage, with scale/position in the preview.
- [Picture overlay workflow](https://www.capcut.com/resource/overlay-picture-on-video): adding an overlay, manipulating preview handles and adjusting its duration.
- [Audio cutting](https://www.capcut.com/resource/cut-recordings): waveform visibility and timeline zoom for locating pauses and precise cuts.
- [Audio extraction](https://www.capcut.com/resource/extract-audio-from-video): detached audio remains independently editable below video.

Cutline’s TypeScript placement rules, stereo min/max cache, HiDPI Canvas drawing and chronological filmstrip sampler are our implementations of these editing affordances. No CapCut proprietary source or assets are included. Native CapCut drag/drop and waveform internals remain unknown.
