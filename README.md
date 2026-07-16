# Open Teleprompter

**Karaoke for the camera — pitches, podcasts, YouTube, auditions, and interviews. Minus the bad singing.**

Free, open-source desktop teleprompter for anyone who speaks on camera or on stage: founders, actors, podcasters, YouTubers, interviewees, educators, and presenters.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/nerdfreakuser/open-teleprompter)](https://github.com/nerdfreakuser/open-teleprompter/releases)

**Site:** [nerdfreakuser.github.io/open-teleprompter](https://nerdfreakuser.github.io/open-teleprompter/)  
**Releases:** [Download Windows builds](https://github.com/nerdfreakuser/open-teleprompter/releases)

---

## Who it’s for

| Use case | Example |
|----------|---------|
| **YouTube / creators** | Talking-head scripts, product videos |
| **Podcasts** | Solo episodes, ad reads, show notes |
| **Actors** | Audition sides, self-tapes, lines |
| **Interviews** | Prepared answers, talking points |
| **Founders / pitches** | Investor decks, demo days, webinars |
| **Anyone else** | Courses, stand-ups, ceremonies |

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
| Scripts | Local machine only |
| API key (optional) | Local only; encrypted with OS `safeStorage` when available |
| AI requests | Directly to Anthropic when you click AI Format — **not** to any third-party product server |

**This repository contains no API keys.** Never commit keys or `.env` files.

---

## Download (Windows)

| Build | Description |
|-------|-------------|
| **Portable** | Run without installing |
| **Setup** | Installer with shortcut |

Get them from **[Releases](https://github.com/nerdfreakuser/open-teleprompter/releases)**.

> **Note:** Builds may be **unsigned**. Windows SmartScreen or Chrome may warn until a code-signing certificate is added. Building from source is always an option.

---

## Run from source

```bash
git clone https://github.com/nerdfreakuser/open-teleprompter.git
cd open-teleprompter
npm install
npm start
```

Requirements: Node.js 18+. Windows recommended for packaged builds (Electron runs on other OSes for development).

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

## License

[MIT](LICENSE)
