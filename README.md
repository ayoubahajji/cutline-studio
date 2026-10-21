# Cutline Studio

**An open-source, local video editor for ecommerce creators.**

Edit product videos, voiceovers, captions, and picture-in-picture scenes for Facebook, Instagram, and other ad placements. Use the Mac desktop application or run the browser editor from source. Editing and Whisper transcription run locally.

Cutline Studio is an independent project. It is not affiliated with CapCut, Meta, or any ad platform.

## What you can do

- Import local video, images, music, and voiceovers by clicking or dragging files onto the timeline.
- Split, trim, duplicate, move, and delete clips. Select several pieces with Shift-click or a selection box, then edit them together.
- Stack videos above other videos. Higher layer rows appear on top. Resize and reposition footage directly in the preview, or use Fill frame / Fit inside.
- Detach a video's audio, edit its waveform, listen to a selected range, remove or keep a range, adjust gain/fades, normalize, and download WAV audio.
- Detect and remove quiet gaps in a selected audio clip with adjustable threshold, minimum gap, and padding. Source files stay unchanged.
- Add text, manual captions, imported SRT/VTT subtitles, or optional local Whisper captions.
- Blur or pixelate a selected rectangular area. Animate position and size with keyframes.
- Use portrait, square, 4:5, or landscape layouts, safe-zone guides, transitions, and basic color adjustments.
- Save and reopen portable `.cutline` projects with media included.
- Export complete-frame H.264/AAC MP4 locally, with source checks and final-output validation.

This is an early-stage editor for short ads, not a complete replacement for a mature desktop editor. See [limitations](#limitations) before relying on a workflow.

## Download the Mac application

[Download Cutline Studio 2.2.0 for Apple Silicon](https://github.com/ayoubahajji/cutline-studio/releases/download/v2.2.0/Cutline-Studio-2.2.0-mac-arm64.dmg)

For M1–M5 Macs on **macOS 13.5 or newer**. The community build includes Electron, Python, FFmpeg/x264, local Whisper large-v3-turbo (quantized model), and the complete Node-based MCP runtime. No Homebrew, Xcode, npm or separate speech-model installation is needed to use it. Allow about 3 GB for installation, plus space for projects and exports; 8 GB RAM minimum, 16 GB recommended. Intel/Windows binaries are not provided.

1. Open the DMG and drag **Cutline Studio** to **Applications**.
2. Eject the DMG and open Cutline from Applications.
3. This community build is **ad-hoc signed, not Apple notarized**. If macOS blocks first launch, try opening it once, then use **System Settings → Privacy & Security → Open Anyway** only if you trust this release. See [Apple's instructions](https://support.apple.com/en-us/102445). Do not disable Gatekeeper globally.
4. Import footage, edit and save a `.cutline` backup. For AI clients, open **Cutline Studio → MCP setup…** and copy the local MCP configuration.

[Installation, troubleshooting and MCP setup](docs/MAC_INSTALL.md) · [Release checksums](https://github.com/ayoubahajji/cutline-studio/releases/tag/v2.2.0) · [Quality checks and limits](docs/QUALITY_CHECK.md) · [Build the app from source](docs/RELEASE_BUILD.md)

The app starts and supervises its local engine. Desktop autosave is separate from browser autosave and MCP projects; portable `.cutline` files transfer edits between them. Closing flushes autosave and asks before cancelling an active export. There is no automatic update service; download new releases manually. Keep your project backups.

## Run from source

### Requirements

- Python 3.10 or newer.
- A current desktop Chrome or Edge browser is recommended.
- FFmpeg with H.264 (`libx264`) and AAC support for MP4 export and video checks. Install it separately and put `ffmpeg` on your PATH, or set `CUTLINE_FFMPEG_BINARY` to its executable path.
- Node.js 22 is used for development tests. It is not needed to run the editor.

### Get the source

```sh
git clone https://github.com/ayoubahajji/cutline-studio.git
cd cutline-studio
```

### macOS

Run:

```sh
python3 launch.py --open
```

Or double-click **Open Cutline Studio.command**. The launcher deploys a local runtime under `~/Library/Application Support/Cutline Studio` and starts a per-user service for the current login session. It opens the editor on `http://127.0.0.1:4178/`, or another available port nearby. Reopening the launcher reuses the service. Use **Stop Cutline Studio.command** or `python3 launch.py --stop` to stop it. After logout, run the launcher again.

If the command files are not executable after downloading a ZIP:

```sh
chmod +x *.command
```

### Linux and other desktop systems

Run the foreground server:

```sh
python3 serve.py --open
```

Keep the terminal open while editing; press Ctrl-C to stop it. The portable server path and encoding tests target Linux as well; a CI template is included. The managed launcher is designed for macOS; Windows-specific workflows have not been verified.

### Optional local captions

Automatic captions require a separately installed `whisper.cpp` executable and a compatible model. Set:

```sh
export CUTLINE_WHISPER_BINARY=/absolute/path/to/whisper-cli
export CUTLINE_WHISPER_MODEL=/absolute/path/to/model.bin
export CUTLINE_FFMPEG_BINARY=/absolute/path/to/ffmpeg
python3 serve.py --open
```

The app does not download models or require an online transcription account. Manual captions and subtitle imports work without Whisper. See [third-party components](THIRD_PARTY.md).

## A simple ecommerce workflow

1. Import product footage and voiceover.
2. Put the product footage on **Main video**. Drag a second clip up to **Layers** to overlay it, then resize it with the preview corners.
3. Select the voiceover. Drag across its larger waveform to select a range; listen to it, delete it, or keep it. Open **Remove silence** to analyze quiet gaps before applying changes.
4. Add captions and a call to action. Use the safe-zone guide to position key text.
5. Select the desired resolution and export MP4. Keep the editor open until the download finishes.

Range deletion and silence removal affect the selected audio only; other tracks keep their timing. Undo restores the original edit. Very small remaining pieces are blocked so saved projects remain valid.

Useful shortcuts: Space plays/pauses, Command/Ctrl-B splits, Command/Ctrl-Z undoes, and Command/Ctrl-C/V copies/pastes selected clips. Shift-click adds or removes clips from selection; Command/Ctrl-A selects unlocked clips when the timeline has focus.

## Reliable export and source checks

Export renders each source frame at its timeline time and mixes audio offline, rather than recording real-time playback. Ordered frame batches are encoded by the local FFmpeg process. After encoding, the file is decoded to verify its picture duration and frame count.

Before export, sources are checked for picture tracks that end before the requested trim and for already-frozen footage. A review names the affected clip and offers source replacement, locating the clip, or explicitly exporting only the valid beginning. Shortening an export also cuts later audio and scenes; the project itself stays unchanged. Intentional source stills can be accepted explicitly.

An unexpected frozen ending is rejected when its source should be moving. Picture-change detection cannot determine creative intent, and missing motion cannot be recreated from an already frozen file. Source checks currently support files up to 512 MB and a four-minute decode timeout. Complete-frame export currently supports MP4 only.

## Privacy and project storage

The server binds to loopback and is intended for your own computer. Media sent to the encoder/transcriber goes only to that local server. Temporary processing files are removed after completion; abandoned export sessions expire. Browser project autosave uses IndexedDB and is tied to the browser and local origin. Download a `.cutline` project file for backups or moving between browsers.

No personal footage, example customer projects, recordings, binaries, models, or private development logs are distributed in this repository. Sample landscapes and sound beds are generated by the app.

Do not expose this development server directly to the internet. It has no multi-user authentication, quotas, or hosted-service isolation.

## Limitations

- Most checks are automated DOM/math tests and synthetic FFmpeg tests; they do not establish exhaustive browser, codec, or long-form compatibility.
- Local captions are fallible. Region blur uses rectangles/keyframes, not automatic text tracking.
- Audio speed changes also change pitch. Audio range edits do not automatically ripple video or captions.
- AI background removal, stabilization, automatic motion tracking, generative media, voice cloning, and native CapCut project compatibility are not implemented.
- Large media can require substantial memory and disk space. Export may take longer than the video duration.
- There is no hosted collaboration, cloud project storage, or mobile editing workflow.

## Development

```sh
npm ci
npm run check
npm run check:encoder
```

The encoder suite requires FFmpeg. Tests generate their own media. A GitHub Actions template is in `docs/ci.github-actions.yml`; enabling it requires a GitHub sign-in with workflow permissions. See [testing](docs/TESTING.md) and [contributing](CONTRIBUTING.md).

The app is plain HTML/CSS/JavaScript in `dist/`, with Python's standard-library local server. No frontend build or production npm dependency is required. See [architecture](docs/ARCHITECTURE.md).

## Contribute

Bug reports, usability improvements, caption tools, export reliability, and documentation help are welcome. Please include reproducible steps and use synthetic media or footage you have permission to share. Do not upload private customer videos, credentials, or personal `.cutline` projects to issues.

## License

[MIT](LICENSE) for this repository's source. Bundled runtime components retain their own licenses. FFmpeg/x264 is GPLv2-or-later and runs as a separate process; its corresponding sources accompany the release. See [third-party notices](THIRD_PARTY.md).

## Edit through MCP

Cutline also has 22 MCP tools for assistants and local server-to-server workflows: project editing, layers, captions, blur, audio cleanup, preview images, verified MP4/WAV exports, undo and editable project handoff. The Mac release bundles its own MCP runtime; use **MCP setup…** in the app menu. Source developers can run `npm run mcp:install` to install a managed runtime and register `cutline_studio` in Codex. It starts on demand and does not need the app window or browser server to stay open. See [MCP setup and capabilities](docs/MCP.md) and the [editing guide](mcp/GUIDE.md).

### Music and production finishing (2.2)

Audio / Ad tools → **Music & finishing** adds original local instrumental music at **7%**, voice loudness measurement and balancing, source inspection, contact sheets, exported-video checks, and a complete delivery ZIP (MP4, editable project, subtitles, mixed audio, previews and checksum report). All six production tools are also available through MCP.

MP4 export uses the native engine when installed, checks the source and completed output, and reports progress as a percentage. Music is enabled by default when no music track exists; uncheck it for a music-free export. Existing music keeps your chosen settings. Unsupported or interrupted exports stop with an error and do not download an incomplete video. No software can guarantee every source file is error-free; inspect the delivered previews and verification report.
