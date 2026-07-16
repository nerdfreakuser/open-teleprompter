# Founder Teleprompter

**Karaoke for investor meetings — minus the bad singing.**

Free, open-source desktop teleprompter for founders. Paste a pitch or video script, format it for reading, and scroll it on screen. Built for second screens, demo days, and practice runs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/nerdfreakuser/founder-teleprompter)](https://github.com/nerdfreakuser/founder-teleprompter/releases)

**Site:** [nerdfreakuser.github.io/founder-teleprompter](https://nerdfreakuser.github.io/founder-teleprompter/)  
**Releases:** [Download Windows builds](https://github.com/nerdfreakuser/founder-teleprompter/releases)

---

## Features

- **Script mode** — paste or upload `.txt` / `.md`
- **Local format** — short lines, speakers (`NAME:`), stage cues — works **offline**, no account
- **Optional AI format** — uses **your** Anthropic API key only (never required)
- **Prompter mode** — play / pause, speed, font size, mirror, fullscreen
- **Keyboard** — Space, ↑↓ skip, ←→ speed
- **Setup wizard** on first launch

### Security / privacy

| Data | Where it goes |
|------|----------------|
| Scripts | Local machine only (`localStorage` / app storage) |
| API key (optional) | Local only; encrypted with OS `safeStorage` when available |
| AI requests | Directly to Anthropic when you click AI Format — **not** to RiseDrivers or this project’s servers |

**This repository contains no API keys.** Never commit keys or `.env` files.

---

## Download (Windows)

| Build | Description |
|-------|-------------|
| **Portable** | Run without installing |
| **Setup** | Installer with shortcut |

Get them from **[Releases](https://github.com/nerdfreakuser/founder-teleprompter/releases)**.

> **Note:** Builds are currently **unsigned**. Windows SmartScreen or Chrome may warn. That is expected until a code-signing certificate is added. Prefer building from source if you prefer.

---

## Run from source

```bash
git clone https://github.com/nerdfreakuser/founder-teleprompter.git
cd founder-teleprompter
npm install
npm start
```

Requirements: Node.js 18+, Windows recommended for the packaged app (Electron runs on other OSes for development).

### Build installers (Windows)

```bash
npm run dist
```

Artifacts land in `release/`.

---

## Project layout

```
electron/     Main process + IPC (settings, optional AI call)
renderer/     UI (wizard, script editor, prompter)
docs/         GitHub Pages landing site
```

---

## Optional AI

1. Open **Settings** in the app  
2. Paste an Anthropic API key  
3. Use **AI Format** when you want  

Without a key, use **Format (local)** or paste a pre-formatted script.

---

## Contributing

PRs and issues welcome. Keep secrets out of the repo. See [SECURITY.md](SECURITY.md).

---

## Credits

Originally built for founders around the RiseDrivers community. This project is **standalone and open source** — not a dependency of any paid product.

---

## License

[MIT](LICENSE)
