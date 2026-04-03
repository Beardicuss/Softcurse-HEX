# Softcurse H.E.X. — Refactor Audit

> Generated: 2026-04-03

## File Size Summary

| File | Lines | Status |
|------|------:|--------|
| `src/js/renderer.js` | **2771** | 🔴 SPLIT |
| `main.js` | **2009** | 🔴 SPLIT |
| `src/css/style.css` | **910** | 🟡 SPLIT |
| `src/index.html` | **756** | ⚪ KEEP (markup) |
| `src/js/ai.js` | **613** | 🟡 SPLIT |
| `src/js/voice.js` | **550** | ⚪ KEEP (single class) |
| `local-voice/engine.js` | **484** | ⚪ KEEP (single class) |
| `src/js/memory.js` | **222** | ✅ OK |
| `src/js/personalities.js` | < 300 | ✅ OK |
| `src/js/browser.js` | **126** | ✅ OK |
| `src/js/activity.js` | < 300 | ✅ OK |
| `src/js/i18n.js` | **104** | ✅ OK |
| `src/js/reminders.js` | < 300 | ✅ OK |
| `src/js/system.js` | < 300 | ✅ OK |
| `src/js/taskbus.js` | **31** | ✅ OK |
| `preload.js` | **149** | ✅ OK |
| `butler-docx.js` | < 300 | ✅ OK |

---

## File 1: `src/js/renderer.js` — 2771 lines (CRITICAL)

The worst offender. This is a "god file" containing **105 functions** across 8+ unrelated concerns.

### Responsibilities Identified

| Section | Lines | Responsibility |
|---------|------:|----------------|
| `init()` + boot | 1–154 | App initialization, event wiring |
| Clock + Stats | 155–220 | Clock updates, system stats display |
| Chat UI | 222–286 | Message rendering, markdown, typing indicator |
| `sendMessage()` | 288–377 | Chat submission, AI call orchestration |
| `handleAIAction()` | 380–1257 | **877 lines!** Giant switch dispatching butler actions |
| Tasks + Health | 1260–1435 | Task running, health stats, proactive messages |
| Toast + Terminal | 1437–1500 | Toast notifications, terminal log |
| 3D Orb Animation | 1501–1676 | Canvas animation (Fibonacci sphere) |
| Voice UI + Language | 1678–1716 | Mic toggle, language switching |
| Settings UI | 1717–2179 | Settings modal, model picker, voice config |
| Processes UI | 2181–2220 | Process list modal |
| Browser bar | 2221–2282 | URL bar, search engine cycling |
| Speak helper + boot | 2283–2302 | speakWithConfig, event listeners |
| Settings tabs | 2303–2317 | Tab switching logic |
| Personality UI | 2318–2442 | Personality CRUD operations |
| Memory tab UI | 2443–2576 | Memory management UI |
| Voice models dir | 2578–2642 | Model directory helpers |
| Direct command parser | 2644–2771 | `tryDirectCommand()` — pattern-matched shortcuts |

### Candidate Split Points

1. **`handleAIAction()`** → `actions.js` (877 lines — biggest single function ever)
2. **Settings UI** → `settings-ui.js` (openSettings, saveSettings, model picker, voice config)
3. **3D Orb** → `orb.js` (canvas animation)
4. **Personality UI** → `personality-ui.js`
5. **Memory tab UI** → `memory-ui.js`
6. **Direct command parser** → `commands.js`
7. **Toast + Terminal** → could stay (small)

---

## File 2: `main.js` — 2009 lines

Electron main process. Contains **107 outline items** across many IPC handlers.

### Responsibilities Identified

| Section | Lines | Responsibility |
|---------|------:|----------------|
| Config + Window | 1–126 | App setup, config persistence, BrowserWindow |
| Helpers | 127–157 | formatBytes, runCmd, safeSend, sendLog |
| System polling | 158–210 | CPU/RAM/disk/net polling loop |
| Activity monitoring | 211–250 | Idle/break detection |
| IPC: Config | 251–263 | Config get/set handlers |
| IPC: Screenshot | 264–289 | Screenshot capture |
| IPC: Memory | 291–307 | Memory read/write/clear |
| IPC: Window + System Info | 308–342 | Window controls, system info |
| IPC: System tasks | 343–443 | TASKS map + task runner |
| IPC: Browser cache | 444–501 | Cache clearing |
| App finder (PS) | 502–693 | `buildAppFinderPS()` + open-app handler |
| Game launchers | 694–895 | Steam/Epic/GOG game discovery + launch |
| Butler: File ops | 896–1100+ | create-file, create-doc, open-folder, etc. |
| Butler: System ops | varies | Processes, volumes, network, clipboard |
| Butler: Advanced | varies | Registry, scripting, automation |
| Voice IPC | ~last 200 | Voice engine handlers |
| Reminders IPC | ~last 50 | Reminder scheduling |

### Candidate Split Points

1. **Butler handlers** → `ipc-butler.js` (file ops, system ops, advanced) — largest block
2. **Game launchers** → `ipc-games.js` (Steam/Epic/GOG logic)
3. **System tasks** → `ipc-tasks.js` (TASKS map + runner)
4. **Voice IPC** → `ipc-voice.js`
5. **App finder** → stays with butler or own file

---

## File 3: `src/js/ai.js` — 613 lines

### Responsibilities Identified

| Section | Lines | Responsibility |
|---------|------:|----------------|
| System prompt builder | 15–220 | **206 lines** of prompt construction |
| Chat orchestration | 222–279 | Main chat flow + memory integration |
| Provider implementations | 281–458 | 10 LLM provider methods (each ~15-20 lines) |
| Action parser | 470–502 | `_parseActions()` |
| Model listing | 505–604 | `fetchModels()` for each provider |

### Candidate Split Points

1. **System prompt** → `ai-prompt.js` (the 206-line `_systemPrompt()` method)
2. **Providers** → could extract, but they're all short methods on the same class — **low priority**

---

## File 4: `src/css/style.css` — 910 lines

### Responsibilities Identified

| Section | Lines | Responsibility |
|---------|------:|----------------|
| Reset + Base | 1–55 | Variables, reset, grid overlay |
| Animations | 56–139 | Keyframes |
| Layout + Panels | 140–260 | App grid, topbar, left panel |
| Center panel | 260–440 | Chat, hex area, input, vitals |
| Right panel | 440–475 | Stats, bars |
| Bottom terminal | 476–530 | Log lines |
| Toast + Settings | 530–760 | Modals, forms, tabs |
| Personality + Memory | 760–910 | Tab-specific styles |

### Candidate Split Points

CSS doesn't have import in plain browser CSS without a build step. Since this is a vanilla Electron app with no bundler:
- **Keep as single file** — splitting CSS requires `<link>` tag changes and complicates load order
- Could split into `base.css`, `components.css`, `modals.css` if desired

---

## Priority Order

1. 🔴 **`renderer.js`** — Most critical. 2771 lines, 8+ unrelated concerns
2. 🔴 **`main.js`** — 2009 lines, but Node.js IPC handlers are easier to extract
3. 🟡 **`ai.js`** — 613 lines, could extract the prompt builder
4. 🟡 **`style.css`** — 910 lines, but CSS splitting adds complexity without a bundler
