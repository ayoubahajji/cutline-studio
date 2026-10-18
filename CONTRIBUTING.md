# Contributing to Cutline Studio

Small, focused improvements to ecommerce editing workflows are welcome.

1. Fork the repository and create a branch.
2. Run `npm ci`, then `npm run check`.
3. Install FFmpeg separately or set `CUTLINE_FFMPEG_BINARY`; run `npm run check:encoder` when changing export, media validation, or server code.
4. Reproduce your change with synthetic or freely shareable media. Check undo/redo, locked tracks, save/reopen, and export when they are affected.
5. Open a pull request describing the problem, resulting behavior, verification, and any remaining limitation.

The application uses classic scripts with shared editor state. Script order matters; keep `dist/index.html` and integrated tests aligned. There is no build step.

Do not commit media, portable projects, engine binaries, model files, access tokens, local paths, logs, or runtime directories. The repository's ignore rules are intentionally conservative about media files. Generate regression fixtures in `output/` during tests.

Contributions are provided under the repository's MIT license. Imported media and separately installed dependencies retain their own terms.
