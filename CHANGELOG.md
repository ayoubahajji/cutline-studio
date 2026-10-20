# Changelog

## 2.1.0 — 20 October 2026

- Added the Apple Silicon Mac application and a downloadable community installer. Local Whisper engine and model, Python media service, FFmpeg and the full MCP runtime are included.
- Added MCP setup to the app menu. Assistants can use 22 tools to edit projects, preview frames, process audio, create captions and render MP4/WAV output without an open editor window.
- Added voiceover replacement, silence cleanup, unused-footage extension, short balanced captions and text-blur presets to both the app and MCP.
- Added mouse movement and eight independent edge/corner resize handles for blur rectangles, with undo, cancellation, keyframes and track locks.
- Improved independent audio selection, waveform range editing, multi-selection, layered video editing and preview transforms.
- Fixed late voiceover segments being lost during audio trimming, fractional source cuts triggering false end-of-source errors, and out-of-range generated captions extending projects.
- Added frame-complete exports, source/output verification, cancellation cleanup and supervised native engine recovery.
- Added clean-environment package checks, installation/troubleshooting documentation, dependency licenses, corresponding tool sources and SHA-256 release checksums.

The Mac community build is ad-hoc signed and not Apple notarized. It targets Apple Silicon and macOS 13.5+. Tests are not a guarantee for every Mac, project or media format. Review generated captions and finished exports.
