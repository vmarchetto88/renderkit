# RenderKit

A cross-platform desktop app for turning flat 3D-viewport screenshots into
finished renders with Google's Gemini image models. Built with **Tauri v2 +
React + TypeScript + Vite**. macOS is the primary target; the codebase avoids
Mac-only APIs so a Windows build remains a future option.

## Features

- **Source image input** — drag-and-drop a PNG/JPG onto the window, or use the
  native file picker.
- **Preset prompts** — one-click preset buttons loaded from an editable
  `prompts.json`, seeded on first run with the **MHS Image-Generation Prompt
  Library** (29 prompts across 10 categories: time-of-day, sketchy/watercolour,
  axonometric, photoreal, material/façade edits, landscape, interior lighting,
  etc.). A category selector filters the buttons; clicking one loads its text
  into the editable prompt field before sending. The seed lives in
  `src-tauri/default_prompts.json`.
- **Preset management** — add / edit / delete / reorder presets (with editable
  category) in a modal; the changes persist back to `prompts.json` on disk.
- **Model tier toggle** — **Flash** (`gemini-3.1-flash-image`) for fast
  iteration, **Pro** (`gemini-3-pro-image`) for final output.
- **Render** — sends `{source image (base64) + prompt}` to the Gemini
  `generateContent` endpoint with `responseModalities: ['TEXT','IMAGE']`,
  decodes the returned image part, and shows it beside the original.
- **Export** — save the rendered image to disk via the native save dialog.

## Security

The Gemini API key is stored in the **OS keychain** (macOS Keychain today,
Windows Credential Manager on a future Windows build) via the `keyring` crate.
It is never bundled, never committed, and never sent to the webview — the
network call runs in Rust, which reads the key from the keychain at render time
and attaches it server-side. Set or clear the key from the in-app **API Key**
dialog.

## Where things live

- `prompts.json` — created on first run in the app config dir
  (`~/Library/Application Support/com.vincentmarchetto.renderkit/` on macOS).
  The exact path is shown at the top of the Manage Presets dialog.
- Rust commands — `src-tauri/src/{keychain,presets,files,gemini}.rs`.
- React UI — `src/App.tsx` plus `src/components/`.

## Development

Prerequisites: Node.js, Rust (stable), and Xcode Command Line Tools.

```bash
npm install
npm run tauri dev      # run the app
npm run tauri build    # produce a distributable bundle
```

## Building installers (Windows + macOS) via GitHub Actions

A Tauri app can't be cross-compiled from macOS to Windows, so Windows builds run
on a Windows CI runner. The workflow at `.github/workflows/build.yml` builds both
platforms:

- **Manual:** push this repo to GitHub → Actions tab → "Build RenderKit" → *Run
  workflow*. When it finishes, download the **renderkit-windows-latest**
  artifact (contains the `.msi` and `.exe` installers) and/or
  **renderkit-macos-latest** (`.dmg`).
- **Release:** push a tag like `v0.1.0` (`git tag v0.1.0 && git push --tags`) and
  the workflow also drafts a GitHub Release with the installers attached.

First push:

```bash
git remote add origin https://github.com/<you>/renderkit.git
git push -u origin main
```

## Note on model IDs

The Flash/Pro model identifiers are defined as constants in
`src-tauri/src/gemini.rs`. Adjust them there if Google's published model names
differ from the ones wired in.
