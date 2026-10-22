# Install Cutline Studio on an Apple Silicon Mac

Download the `.dmg` and `SHA256SUMS.txt` from [GitHub Releases](https://github.com/ayoubahajji/cutline-studio/releases/tag/v2.3.0). Use macOS 13.5+ on an M1/M2/M3/M4/M5 Mac. This release does not run on Intel. Minimum 8 GB RAM; 16 GB recommended. Allow about 3 GB of disk space for installation, plus project/export space.

Open the disk image, drag **Cutline Studio** into **Applications**, eject the image and launch from Applications. Whisper, the large-v3-turbo quantized model, FFmpeg, Python and the MCP Node runtime are included. Editing and transcription work offline. Your AI client may require its own internet connection, account or paid plan.

## First launch of the community build

This release is ad-hoc signed and **not Apple notarized**. A download can therefore be blocked by Gatekeeper. Try opening the app once, then use **System Settings → Privacy & Security → Open Anyway**, confirm Open and authenticate if requested. Only do this for a release you trust. [Apple explains the process](https://support.apple.com/en-us/102445). Do not disable macOS security globally. An organizational policy can prevent this override; contact the administrator in that case.

Optionally verify the downloaded image in Terminal, from its download folder:

```sh
shasum -a 256 Cutline-Studio-2.3.0-mac-arm64.dmg
```

Compare the result with `SHA256SUMS.txt` on the release page. A matching checksum confirms the file matches that release, not that it has been independently audited.

## Connect an AI client through MCP

Use **Cutline Studio → MCP setup… → Copy MCP JSON**. Add a local stdio server in your compatible MCP client and restart the client. The menu's JSON contains the actual installed app path. With the standard installation, it is:

```json
{
  "mcpServers": {
    "cutline_studio": {
      "command": "/Applications/Cutline Studio.app/Contents/Resources/mcp-runtime/bin/node",
      "args": ["/Applications/Cutline Studio.app/Contents/Resources/mcp-runtime/mcp/server.cjs"]
    }
  }
}
```

For Codex with its CLI already installed, **Copy Codex CLI command** supplies a properly quoted `codex mcp add` command. Otherwise add the same command and argument in your client's MCP settings. You do not need to install Node or Python. The server starts on demand; the app window need not stay open. Do not run MCP from a mounted disk image. Moving the app after configuring MCP requires updating its paths.

MCP has your account's local file access. Connect it only to a trusted client. Read [the tools guide](MCP.md). MCP projects are stored under `~/Library/Application Support/Cutline Studio MCP`; desktop autosave is separate. Transfer a `.cutline` project using project Open/Save. Stdio is the default. Authenticated HTTP is optional and loopback-only; see [MCP.md](MCP.md).

## Troubleshooting

- **“Not supported on this Mac”:** verify Apple Silicon and macOS 13.5+. Intel is not supported by this image.
- **First-open warning:** follow the Apple instructions above. If the image fails its checksum, download it again rather than overriding a warning.
- **Caption generation unavailable:** use the released complete app. Do not move files out of its bundle. Check free space and reopen; import SRT/VTT as an alternative. Speech recognition can mishear words; review the result.
- **Engine startup issue:** reopen the app. Check **Cutline Studio → Open desktop data folder → desktop.log**. Another local app may occupy the default ports; Cutline searches nearby ports. Include the error and macOS version in a bug report, without private media or credentials.
- **MCP fails to start:** verify the app is in Applications, copy fresh MCP JSON from the menu, restart the client and check its MCP logs. Each argument is a separate field; do not paste an entire shell command into the command field.
- **Frozen/damaged source warning:** replace or shorten the named source. Checks cannot invent missing motion. Inspect the exported video before publishing it.
- **Desktop edit missing in MCP/browser:** their stores are independent. Save `.cutline` in the original editor and open it in the other one.

## Updates and removal

There is no automatic updater. Save a portable project backup, quit Cutline and your active MCP jobs, then replace the app with a newer download. Do not replace a running app bundle. Media/projects in Application Support are not part of the app bundle. Deleting the app does not delete those data folders. Remove the MCP entry from your client if uninstalling.

Hardware QA currently covers an Apple M1 Mac with 8 GB RAM on macOS 26.6.1. Automated checks cover synthetic workflows; no release can guarantee every codec, project or Mac configuration. See [quality report](QUALITY_CHECK.md).
