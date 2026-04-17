# Phase 4 — H.E.X ↔ Interceptor Integration Guide

> **Before you start:** Phases 1–3 must be running and passing their health check.
> Confirm: `curl http://localhost:3500/health` returns `{"status":"ok",...}`

---

## What This Phase Does

Three surgical changes to H.E.X. Nothing else in the codebase is touched.

```
User types message
    ↓
renderer.js: sendMessage()
    ↓
[NEW] hexInterceptor.precheck()   →  POST /precheck  →  sanitize + tool-policy
    ↓                                                    returns traceId + allowedTools
window.hexAI.chat()               →  provider API   →  actual AI call (unchanged)
    ↓
[NEW] hexInterceptor.postlog()    →  POST /postlog   →  log full trace (fire-and-forget)
    ↓
actions loop — each action:
[NEW] hexInterceptor.allowAction() → cached policy check (no network)
    ↓ (blocked actions are logged and skipped)
handleAIAction()                  →  executes as before
```

The interceptor **never touches the AI call itself** — H.E.X keeps its multi-provider
fallback logic, complexity routing, and vision delegation completely intact.

---

## File Manifest

```
hex-phase4/
├── hex-patches/
│   ├── hex-interceptor-client.js   ← DROP into Softcurse-HEX-main/src/js/
│   ├── renderer.js.patch.md        ← 3 surgical edits to renderer.js
│   └── index.html.patch.md         ← 1 line added to index.html
│
└── hex-interceptor-additions/      ← ADD these to your hex-interceptor project
    ├── precheck-runner.ts           → src/pipeline/precheck-runner.ts
    ├── postlog-runner.ts            → src/pipeline/postlog-runner.ts
    └── new-routes.ts                → paste contents into src/index.ts
```

---

## Step-by-Step Integration

### Step 1 — Add new files to the interceptor (hex-interceptor project)

```bash
# From inside your hex-interceptor/ directory:

cp hex-phase4/hex-interceptor-additions/precheck-runner.ts src/pipeline/
cp hex-phase4/hex-interceptor-additions/postlog-runner.ts  src/pipeline/
```

Then open `src/index.ts` and make two edits:

**A) Add imports near the top** (after existing imports):
```typescript
import { runPrecheck } from "./pipeline/precheck-runner.js";
import { runPostlog }  from "./pipeline/postlog-runner.js";
import { RequestContext } from "./types/index.js";
```

**B) Paste the contents of `new-routes.ts` just before the `server.listen()` call at the bottom.**

Restart the interceptor:
```bash
npm run dev
# Confirm new endpoints:
# POST http://localhost:3500/precheck
# POST http://localhost:3500/postlog
```

---

### Step 2 — Add the client file to H.E.X

```bash
# From inside Softcurse-HEX-main/
cp hex-phase4/hex-patches/hex-interceptor-client.js src/js/
```

---

### Step 3 — Apply the index.html patch (1 line)

Open `src/index.html`. Find:
```html
<script src="js/ai.js"></script>
```

Add one line directly after it:
```html
<script src="js/ai.js"></script>
<script src="js/hex-interceptor-client.js"></script>
```

---

### Step 4 — Apply the renderer.js patch (3 changes)

Open `src/js/renderer.js` and apply the 3 changes described in `renderer.js.patch.md`.

**Summary of changes:**

| # | Location | What changes |
|---|----------|--------------|
| 1 | After `let visionEnabled = false;` (~line 406) | Add session ID initializer |
| 2 | Around `window.hexAI.chat(...)` (~line 471) | Wrap with precheck + postlog |
| 3 | Inside parallel batch map + sequential loop | Gate each action via `allowAction()` |

---

### Step 5 — Verify end-to-end

Start H.E.X normally (`npm start`), open the app, type a message.

**What you should see in the interceptor logs:**
```
POST /precheck  200  { traceId: "...", allowedTools: [...] }
POST /postlog   200  { traceId: "...", content: "..." }
```

**Verify a trace is stored:**
```bash
curl http://localhost:3500/trace/<traceId-from-logs>
```

**Test action blocking (sandbox mode):**
In `hex-interceptor-client.js`, temporarily change the mode sent in precheck from
`'normal'` to `'sandbox'`. Actions like `file.write`, `shell.exec`, and `network.fetch`
will be blocked and logged. Restore to `'normal'` when done.

---

## Behaviour When Interceptor Is Offline

The client is designed to **fail open**, not fail hard. If `localhost:3500` is unreachable:

- `precheck()` returns the original unsanitized text + a fallback tool list
- `postlog()` silently swallows the error
- `allowAction()` returns `true` (uses last cached tool list, or allows all if no cache)
- **H.E.X works exactly as it did before, with zero UX impact**

To enforce hard-fail mode (interceptor required), change the `passthrough` flag in
`hex-interceptor-client.js`:
```javascript
// In interceptorPrecheck(), change the catch block return to:
return { ok: false, rateLimited: false, traceId: null, sanitized: '', allowedTools: [], warnings: ['Interceptor unreachable'], flags: {} };
// Then add an early return in renderer.js if ok === false
```

---

## Environment Variable Override

The interceptor URL defaults to `http://localhost:3500`.
Override it before the script loads by setting `window.__INTERCEPTOR_URL__`
in the HTML or via a config injection in `main.js`:

```javascript
// In main.js, before BrowserWindow loads the file:
mainWindow.webContents.on('did-finish-load', () => {
  mainWindow.webContents.executeJavaScript(
    `window.__INTERCEPTOR_URL__ = 'http://localhost:${YOUR_PORT}';`
  );
});
```

---

## What Phase 5 Builds On

After Phase 4 is stable in production, the interceptor has:
- A full history of every AI call, tool used, and action executed
- Per-session unsafe flag counts (ready for dynamic mode demotion)
- Trace IDs linked to memory turns (ready for "why did HEX do that?" UI)