# ◆ Softcurse H.E.X.

> **H**euristic **E**xperience **X**ecutive — Intelligent Cyberpunk Desktop Assistant

A J.A.R.V.I.S.-inspired desktop assistant with a cyberpunk UI, multi-language support, system automation, voice I/O, and LLM-powered conversation.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ ([nodejs.org](https://nodejs.org))
- **npm** v9+
- *(Optional)* **Ollama** for local AI ([ollama.ai](https://ollama.ai))

### Install & Run

```bash
cd softcurse-hex
npm install
npm start
```

---

## 🧠 AI Configuration

Open **Settings** (⚙ top-right or `Ctrl+,`) and choose your LLM provider:

### Option 1 — Ollama (Local, Free, Private)
1. Install Ollama: https://ollama.ai
2. Pull a model:
   ```bash
   ollama pull llama3
   # or: ollama pull mistral
   ```
3. In Settings: Provider → **Ollama**, Base URL → `http://localhost:11434`, Model → `llama3`

### Option 2 — OpenAI
1. Get an API key at https://platform.openai.com
2. In Settings: Provider → **OpenAI**, API Key → `sk-...`, Model → `gpt-4o-mini`

### Option 3 — Anthropic
1. Get an API key at https://console.anthropic.com
2. In Settings: Provider → **Anthropic**, API Key → `sk-ant-...`, Model → `claude-haiku-4-5-20251001`

---

## 🎙 Voice Features

- **Web Speech API** (built into Electron's Chromium) — no external packages needed
- Click the **MIC** button (top-right) or press `Ctrl+M` to toggle listening
- Speak your message — it will be transcribed and sent automatically
- HEX will respond with synthesized voice
- Supports **English, Russian, Georgian** (select with EN/RU/KA buttons)

---

## 🖥 System Tasks

| Task | Description |
|------|-------------|
| **Defragmentation** | Optimizes disk on Windows; verifies volume on macOS/Linux |
| **Component Store** | DISM health restore (Win) / package updates (Linux/macOS) |
| **Defender Scan** | Quick security scan (Windows Defender / ClamAV on Linux) |
| **Process Monitor** | View and terminate running processes |
| **Browser Cache** | Clears Chrome, Edge, Firefox cache folders |
| **Driver Health** | Enumerates drivers (Windows) / hardware info (macOS/Linux) |
| **Disk Cleanup** | Runs cleanmgr (Win) / periodic scripts (macOS) / apt clean (Linux) |
| **Network Diagnostics** | Pings gateway + DNS, checks connectivity and latency |
| **Startup Programs** | Lists auto-start entries and scheduled tasks |
| **Update Check** | Checks for pending OS updates |
| **Firewall Status** | Queries firewall profiles and active block rules |
| **Memory Diagnostics** | RAM overview + top 15 memory consumers |

---

## 🤵 Butler Actions

HEX can interact with your PC directly via natural language:

| Command | Example |
|---------|---------|
| Open applications | *"Open notepad"*, *"Launch Chrome"*, *"Open VS Code"* |
| Create notes | *"Create a note called shopping list with milk, bread, eggs"* |
| Create documents | *"Create a Word document called meeting notes"* |
| Open folders | *"Open my Documents folder"*, *"Open Downloads"* |
| Empty recycle bin | *"Empty the recycle bin"* (with confirmation) |
| Lock screen | *"Lock my computer"* |
| Shutdown/Restart | *"Shut down"*, *"Restart"* (with confirmation) |

---

## 💬 Chat Commands

You can type or speak natural language. Examples:

- `"What's my CPU usage?"` — HEX will report system stats
- `"Remind me to drink water in 30 minutes"` — sets a reminder
- `"Run a defrag"` — triggers defragmentation
- `"Open youtube.com"` — opens URL in default browser
- `"Show running processes"` — opens process monitor
- `"Tell me a joke"` — just chat!

---

## ⌨ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send chat message |
| `Shift+Enter` | Newline in chat |
| `Ctrl+M` | Toggle microphone |
| `Ctrl+,` | Open settings |
| `Ctrl+L` | Focus browser URL bar |
| `Escape` | Close modals |

## 🌐 Browser Bar

The URL bar in the center panel (blue, below the HEX ring) supports:

- **Direct URLs:** `https://github.com` or `github.com`
- **Web search:** `how to defrag windows` → searches with your default engine
- **Engine prefix:** `search youtube for lo-fi music`
- **Click 🔍** to cycle through Google → DuckDuckGo → Bing → YouTube → GitHub
- You can also say things like *"open youtube.com"* or *"search for Electron docs"* in the chat

All URLs open in your **system default browser** (Chrome, Firefox, Edge, Safari etc.).

---

## 📦 Building for Distribution

```bash
npm run build
```

Output will be in the `dist/` folder.

- **Windows** → NSIS installer (`.exe`)
- **macOS** → DMG (`.dmg`)
- **Linux** → AppImage (`.AppImage`)

---

## 📁 Project Structure

```
softcurse-hex/
├── main.js           Electron main: window, IPC, system commands
├── preload.js        Secure renderer bridge
├── src/
│   ├── index.html    App layout
│   ├── css/style.css Cyberpunk stylesheet
│   └── js/
│       ├── renderer.js  UI logic, chat, animations
│       ├── ai.js        LLM conversation engine
│       ├── voice.js     Web Speech API (STT/TTS)
│       ├── i18n.js      Translation engine
│       ├── activity.js  Activity monitoring
│       └── reminders.js Reminder system
├── locales/          en/ru/ka translations
└── package.json
```

---

## 🌐 Supported Languages

| Code | Language |
|------|----------|
| `en` | English |
| `ru` | Русский (Russian) |
| `ka` | ქართული (Georgian) |

Switch anytime using the **EN / RU / KA** buttons in the top bar. The AI will respond in the selected language.

---

## 🔒 Privacy

- All conversation history is **in-memory only** — nothing persisted to disk by default
- Config (LLM settings, preferences) saved to your OS user data directory
- No telemetry, no analytics, no external connections unless you configure an API provider
- Activity monitoring stays local

---

## 🐛 Troubleshooting

**App won't start:**
```bash
npm install --legacy-peer-deps
npm start
```

**Voice not working:**  
Chromium-based speech recognition requires a microphone. Grant permission when prompted.  
Georgian (`ka`) may fall back to English if your OS doesn't have the language pack.

**Ollama not responding:**  
Make sure `ollama serve` is running. Test: `curl http://localhost:11434/api/tags`

**High CPU from systeminformation:**  
Normal on first launch. Polling interval is 2s; modify in `main.js` if needed.

---

*Built with passion, precision, and a cyberpunk soul.*  
*HEX is not just a tool — it's a companion.*
