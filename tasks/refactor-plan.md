# Softcurse H.E.X. — Refactor Split Plan

> Phase 2: Module Maps

## Split 1: `renderer.js` (2771 → ~7 files)

### Module Map

| New File | Contains | Imports From | Exports |
|----------|----------|-------------|---------|
| `renderer.js` (entry) | `init()`, boot wiring, clock, stats, chat UI, `sendMessage()` | all below | orchestration hub |
| `actions.js` | `handleAIAction()` — 877-line switch | `renderer.js` globals via `window` | `handleAIAction(action)` |
| `orb.js` | 3D orb animation: `initHexCanvas`, `resizeHexCanvas`, `startHexAnimation` | `taskbus.js` via `window` | `initHexCanvas()`, `startHexAnimation()` |
| `settings-ui.js` | `openSettings`, `closeSettings`, `saveSettings`, `updateProviderUI`, `fetchAvailableModels`, `renderModelPicker`, `selectModel`, voice config UI | config, i18n via `window` | `openSettings()`, `closeSettings()`, `saveSettings()` |
| `personality-ui.js` | `refreshPersonaList`, `activatePersonality`, `editPersonality`, `clonePersonality`, `deletePersonality`, `savePersonality`, `clearPersonaForm`, `persistPersonalities`, `updatePersonaBadge` | `window.hexPersonalities` | `refreshPersonaList()`, `updatePersonaBadge()` |
| `memory-ui.js` | `refreshMemoryTab`, `filterMemoryFacts`, `deleteMemoryFact`, `deleteFact`, `compressSession`, `showMemoryReport`, `clearMemoryFacts`, `clearMemoryHistory`, `clearAllMemory` | `window.hexMemory` | `refreshMemoryTab()` |
| `commands.js` | `tryDirectCommand()` — 128-line direct command parser | `window.hexAPI.butler`, action handler | `tryDirectCommand(text)` |

### Shared Globals (via `window`)
All modules rely on these renderer globals. Instead of refactoring into proper imports (which would change behavior), they remain as globals accessed via `window` or script-scope:
- `config`, `sysStats`, `taskState`
- `addLog()`, `addHexMessage()`, `showToast()`, `speakWithConfig()`
- `window.hexAPI`, `window.hexAI`, `window.hexMemory`, etc.

### Circular Dependency Risk: **NONE**
All extracted modules are leaf nodes — they call into the global scope but nothing calls across the extracted modules.

### Load Order (in `index.html`)
```html
<script src="js/taskbus.js"></script>
<script src="js/i18n.js"></script>
<script src="js/system.js"></script>
<script src="js/voice.js"></script>
<script src="js/ai.js"></script>
<script src="js/activity.js"></script>
<script src="js/reminders.js"></script>
<script src="js/browser.js"></script>
<script src="js/memory.js"></script>
<script src="js/personalities.js"></script>
<!-- New extracted modules (before renderer.js) -->
<script src="js/orb.js"></script>
<script src="js/actions.js"></script>
<script src="js/commands.js"></script>
<script src="js/settings-ui.js"></script>
<script src="js/personality-ui.js"></script>
<script src="js/memory-ui.js"></script>
<!-- Entry point — must be last -->
<script src="js/renderer.js"></script>
```

---

## Split 2: `main.js` (2009 → ~4 files)

### Module Map

| New File | Contains | Requires | Exports |
|----------|----------|----------|---------|
| `main.js` (entry) | Config, window, polling, activity, IPC wiring | all below | main process entry |
| `ipc-butler.js` | All `butler:*` IPC handlers (file ops, clipboard, audio, network, env, maintenance, scripting, advanced) | electron, fs, path, os, exec | `registerButlerHandlers(ipcMain, mainWindow)` |
| `ipc-games.js` | `butler:get-steam-games`, `butler:get-epic-games`, `butler:launch-game`, `buildAppFinderPS()` | fs, path, shell | `registerGameHandlers(ipcMain, shell)` |
| `ipc-tasks.js` | `TASKS` map + `system:run-task` handler | exec, safeSend | `registerTaskHandlers(ipcMain, safeSend, sendLog)` |

### Circular Dependency Risk: **NONE**
Each IPC module is a leaf — it registers handlers and calls back via passed `safeSend`/`sendLog` references.

---

## Split 3: `ai.js` (613 lines) — LOW PRIORITY

### Module Map

| New File | Contains | Exports |
|----------|----------|---------|
| `ai-prompt.js` | `_systemPrompt()` method body (206 lines of prompt text) | `buildSystemPrompt(state, lang)` |
| `ai.js` | Class HexAI — all provider methods, chat, action parser | `window.hexAI` |

### Risk: LOW
The prompt is a pure function — no dependencies on class state beyond `window.hexPersonalities` and `window.hexMemory`.

---

## Split 4: `style.css` (910 lines) — OPTIONAL

Since this is a vanilla Electron app with no CSS bundler, splitting CSS requires adding multiple `<link>` tags. This is low-value and can be deferred.

---

## Execution Order

1. **renderer.js** — Start with `actions.js` (biggest, cleanest cut)
2. **renderer.js** — Extract `orb.js`
3. **renderer.js** — Extract `commands.js`
4. **renderer.js** — Extract `settings-ui.js`
5. **renderer.js** — Extract `personality-ui.js`
6. **renderer.js** — Extract `memory-ui.js`
7. **main.js** — Extract `ipc-butler.js`
8. **main.js** — Extract `ipc-games.js`
9. **main.js** — Extract `ipc-tasks.js`
10. **ai.js** — Extract `ai-prompt.js` (optional)

Each extraction: create file → move code → add `<script>` tag → verify app launches → commit.
