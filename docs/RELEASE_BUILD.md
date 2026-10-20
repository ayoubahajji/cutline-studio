# Build the Apple Silicon community release

Build on an Apple Silicon Mac with Xcode Command Line Tools, Git, Node/npm and Python 3.9+ installed. The finished app requires none of those external developer tools. Current release runtime: Electron 44.9.0, Node 26.3.0, bundled Python 3.9.6; minimum macOS 13.5. Dependency versions are pinned by package-lock; Python build tools below should be pinned when reproducing this release.

```sh
npm ci
node node_modules/electron/install.js
python3 -m venv .desktop-build/venv
.desktop-build/venv/bin/pip install pyinstaller==6.22.3 cmake==4.4.4
.desktop-build/venv/bin/python desktop/prepare-release.py
.desktop-build/venv/bin/python desktop/build.py --release
```

`prepare-release.py` builds the pinned whisper.cpp revision with generic ARM64 CPU code, embedded Metal kernels and static libraries. It builds FFmpeg n7.1.5 plus the pinned x264 revision, with no other external codec libraries, and verifies the Whisper model against its pinned upstream Hugging Face LFS SHA-256. Native canvas crate sources are checksum-verified against the shipped SBOM; notices for their Rust dependencies, Skia and relevant Skia libraries are retained. The build cache defaults to `~/.cache/cutline-release-arm64` (override `CUTLINE_RELEASE_DEPS`); its path must not contain spaces because upstream Makefiles do not support them reliably. All required runtime tools and weights are copied inside the app. Network access is needed to prepare dependencies, not to run transcription.

`desktop/build.py --release` freezes the shared media worker and HTTP service into one Python executable, packages production MCP modules and a copy of the builder's Node executable, includes licenses and provenance, and ad-hoc signs the bundle. Use the official ARM64 Node distribution with its LICENSE in the parent of bin. Release builds need at least several GB of free storage. Never include private media, projects, credentials, runtime data or user logs in releases.

## Verification and disk image

Run the relevant suites in [TESTING.md](TESTING.md), then test the packaged service and `tests/packaged-release.cjs`. The latter uses bundled Node and a fresh HOME with no developer-tool PATH. Supply a short speech WAV for the optional real transcription check; the upstream whisper.cpp `samples/jfk.wav` is used for the release QA.

```sh
python3 tests/packaged-service.py '.desktop-build/Cutline Studio.app'
'.desktop-build/Cutline Studio.app/Contents/Resources/mcp-runtime/bin/node' tests/packaged-release.cjs '.desktop-build/Cutline Studio.app' /path/to/speech.wav
.desktop-build/venv/bin/python desktop/package-release.py
```

The package script creates a drag-to-Applications DMG, source archives for the exact FFmpeg/x264/whisper.cpp sources and build instructions, then writes SHA-256 checksums. Publish all generated assets together in a GitHub release. Validate the mounted DMG copy too; do not publish an installer from a failed build. Keep the source archives available with the binary for license compliance.

## Signing status

This community release is ad-hoc signed, not Developer ID signed or notarized. Its documentation explicitly explains Gatekeeper's one-time trusted-app override. A future notarized release needs an Apple Developer ID Application certificate, hardened-runtime signing with suitable Electron entitlements, notarization and stapling. Never label an ad-hoc build notarized or suppress macOS security protections globally.

Tests on one Mac cannot establish every OS/hardware combination. Keep the tested OS and hardware in the quality report and release notes.
