# Cutline Studio MCP

Cutline can be used by an assistant or another service through Model Context Protocol. Its 29 tools provide durable projects, timeline edits, audio cleanup, subtitles, image previews, complete MP4/WAV rendering, background jobs and portable desktop project handoff. No browser window, browser automation or running desktop server is required.

## Mac application (recommended)

The Apple Silicon release bundles its own Node, native canvas, FFmpeg, frozen Python media worker, Whisper engine and model. Install it in Applications, then use **Cutline Studio → MCP setup… → Copy MCP JSON**. Add the configuration to your local MCP client and restart that client. There is no npm, Python or model installation for this path. See [Mac installation](MAC_INSTALL.md). MCP can run while the app window is closed. Moving the app after setup requires updating the MCP paths.

## Install a separate runtime from source

```sh
npm install
npm run mcp:install
```

The installer copies the server, production dependencies, Node and FFmpeg into `~/Library/Application Support/Cutline Studio MCP/runtime`. It registers the global `cutline_studio` MCP entry using `codex mcp add`. Projects and jobs are stored beside the runtime and survive runtime updates. Node/FFmpeg do not need to remain installed elsewhere for this managed runtime; Python 3 is required for the shared source verifier and optional local Whisper adapter. On macOS the default Python is `/usr/bin/python3`; override with `CUTLINE_PYTHON` if needed.

The installer requires npm and the Codex CLI. Use `node mcp/install.cjs --no-register` to install without changing a client configuration. This does not publish to GitHub or any MCP directory. The desktop app and live autosave are left alone.

Start a fresh Codex session to load the registered tools. The assistant can read `cutline://guide`; [the same maintained guide](../mcp/GUIDE.md) documents coordinates, timing, every operation, workflows and limitations. A `cutline-video-editor` personal skill can point future sessions to this interface; the repository works without installing that skill.

## Other MCP clients: stdio

From the source checkout:

```json
{
  "mcpServers": {
    "cutline_studio": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/cutline-studio/mcp/server.cjs"]
    }
  }
}
```

For the managed installation, point command to `runtime/bin/node`, args to `runtime/mcp/server.cjs`, and set `CUTLINE_FFMPEG_BINARY` to `runtime/tools/ffmpeg` using absolute paths. The client starts/stops the process; no permanently running web server or open app is needed. stdout carries MCP JSON-RPC only. A small standard SDK helper is also available: `node mcp/client.cjs TOOL arguments.json` or `--list` / `--guide`. It keeps the connection open until any started media job finishes, so current sessions can use the same server before their native tool list refreshes. Preview results include their local image path; the helper does not print image base64.

## Server-to-server Streamable HTTP

```sh
npm run mcp:http
```

The source server listens at `http://127.0.0.1:4180/mcp`. Use `node mcp/server.cjs --http --port 4181` to choose another port. It generates a private `http-token` under `CUTLINE_MCP_HOME` (default: `~/Library/Application Support/Cutline Studio MCP`). Supply its value as `Authorization: Bearer ...`. `CUTLINE_MCP_TOKEN` can provide an existing token of at least 24 characters; never commit it. The server prints the token file's path, not the secret. Each request is stateless at transport level; projects and jobs share the durable local engine. Standard MCP SDK clients work with `StreamableHTTPClientTransport` and authorization headers.

The HTTP listener is loopback-only, validates hosts, requires a bearer token, and refuses browser-origin requests. It does not expose a public internet listener or upload API. Machines outside this Mac need a separately configured authenticated tunnel/proxy and access to their own media files; remote hosting is not installed automatically. Configure a service manager if you want HTTP to stay running independently; Codex's installed stdio entry needs no such service.

## Tools

| Tool | Purpose |
|---|---|
| `cutline_replace_voiceover`, `cutline_fit_footage` | Clean soundtrack replacement and footage extension |
| `cutline_captions_format`, `cutline_blur_region` | Readable captions and adjustable text blur |
| `cutline_capabilities` | Feature map, local engine availability and conventions |
| `cutline_project_create`, `cutline_project_list`, `cutline_project_get` | Isolated durable projects and complete state |
| `cutline_project_edit` | Atomic batches, clip edits, layers, text, blur, transitions and keyframes |
| `cutline_history` | Undo/redo |
| `cutline_media_import` | Copy chosen local media into a project |
| `cutline_source_check` | Decode/validate picture duration and baked-in freezes |
| `cutline_audio_silence`, `cutline_audio_normalize` | Selected-clip cleanup and gain |
| `cutline_captions_import`, `cutline_captions_export`, `cutline_captions_generate` | Editable subtitles and optional local Whisper |
| `cutline_preview` | Inspectable PNG at a chosen timeline time |
| `cutline_render`, `cutline_job` | Background verified MP4/WAV export, progress and cancellation |
| `cutline_project_save`, `cutline_project_open` | Portable `.cutline` files and normal Mac app handoff |

Mutations require the current `expectedRevision`. Media/project validation and track locks apply before commits; invalid batches roll back. Project writes use atomic file replacement and per-project write locks, so multiple MCP clients cannot silently overwrite the same revision. Jobs render snapshots and save status/results. Preview/export artifacts remain under that project's exports directory. Source files and the live desktop IndexedDB are never rewritten.

## Rendering and limits

The headless renderer reuses the editor's timeline math, geometry, source checker, subtitles and silence detector. Skia canvas reproduces main footage, ordered overlays, blur/pixelation, text, cropping, transform keyframes, fades, filters and the three transitions. It decodes source frames explicitly and refuses to substitute an ended source with a frozen frame. FFmpeg mixes and encodes audio/video, then the shared verifier decodes the finished MP4 to check frame count/duration and unexpected frozen tails.

Text metrics/font rasterization and audio presets can differ from the browser implementation. Preview text and listen to exports before final delivery. Source imports are limited to 512 MB, portable project imports to 1 GB; audio analysis has a decoded-memory limit. Exports are 30 fps H.264/AAC; oversized/unsupported requests fail clearly. Whisper uses the user's existing local installation and model; neither is downloaded automatically. Current MCP tools operate on file-backed projects, not a live app timeline.

## Checks

```sh
npm run check:mcp
npm run check:mcp:encoder
```

The first suite uses real stdio and Streamable HTTP MCP clients, actual FFmpeg media and PNG pixels. It checks tool discovery, revisions/rollback, locks, undo, selected-only silence edits, captions, native compositing, MP4/WAV delivery, portable reopen and HTTP auth. The longer regression renders/decodes all 1,818 frames through a 60.6-second three-scene timeline, checks wipe/slide transitions, refuses source overrun, and verifies cancellation cleanup. Tests use temporary generated media and never open user projects.

Protocol implementation uses the [official MCP SDK](https://ts.sdk.modelcontextprotocol.io/server). Client registration follows [OpenAI's MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Production finishing

Read [the production tool guide](../mcp/GUIDE.md#production-tools-22) for `cutline_background_music`, `cutline_media_inspect`, `cutline_contact_sheet`, `cutline_audio_loudness`, `cutline_export_verify`, and `cutline_delivery_bundle`. Prefer these tools to assistant-written media-analysis, packaging or audio-processing scripts. MP4 export adds music at 7% if absent; set `music:false` when deliberately exporting without a music bed. Read the updated revision before subsequent edits.

A running client's tool catalog may remain cached after an update. A fresh MCP connection loads all 29 tools. The standard SDK client (`mcp/client.cjs`) can use the updated engine immediately without automating the browser.

`cutline_layer_add` uses the same TypeScript placement rules as the app. Choose an imported image/video and optionally `overClipId` or an exact `at` time. Photos default to contain at 60%, overlap the base, and stop at its end. Main timing/framing is preserved and locked Main footage can receive an unlocked overlay.
