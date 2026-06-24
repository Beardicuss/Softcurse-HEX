# HEX Smoke Checklist

Focused validation pass for `Softcurse H.E.X.` after the refactor and continuity upgrades.

## Desktop HEX

- Startup
  - App boots without blank screen or renderer crash.
  - Main dashboard renders all major panels.
  - Settings window opens from the UI.
  - Language switching still updates visible UI labels.
- Chat
  - Typing a message and pressing `Enter` sends it once.
  - `Shift+Enter` inserts a newline without sending.
  - A normal greeting gets either an AI reply or a clear provider error panel.
  - No duplicate user turn or duplicate assistant turn is stored for one chat send.
- Continuity
  - Short follow-up like `open it` or `third one` uses previous context.
  - Browser follow-up uses the active browser session instead of opening a fresh search.
  - Desktop follow-up uses recent app/file/game/window/process candidates when available.
  - Restart or reopen preserves warm session continuity when local or cloud state exists.
- Browser
  - Open/search/scrape APIs still resolve through the canonical browser bridge.
  - Browser candidate extraction populates follow-up targets.
  - Browser status is reflected into AI context state.
- Desktop actions
  - File listing and open/reveal follow-ups resolve correctly.
  - App/software listing and open/launch follow-ups resolve correctly.
  - Game listing and launch follow-ups resolve correctly.
  - Window/process listing and follow-up actions resolve correctly.
- Memory
  - One normal chat exchange triggers one extraction pass.
  - Reflection/extraction failures do not crash the main send flow.
  - Recent-turn continuity is visible in prompt state and memory session summary.
- AI provider routing
  - Live key pool loads from hunter-backed cloud sync when configured.
  - Broken providers are surfaced clearly in the failure panel.
  - Auto-fallback skips unsupported or stale provider/model combinations.
- Cloud
  - Cloud health check does not falsely mark reachable server as offline.
  - Profile resolve works when token/server are configured.
  - Session ensure and live snapshot push do not break local chat flow when remote sync fails.

## HEX Server

- Public health
  - `GET /api/health` is reachable without token.
  - Locked APIs report auth-required, not false offline.
- Auth flow
  - Missing token shows locked state in site UI.
  - Invalid token shows locked state in site UI.
  - Valid token unlocks bootstrap, profiles, and continuity views.
- Hunter bridge
  - Hunter status endpoint reports configured state accurately.
  - Provider stats, key summary, and valid-key routes proxy successfully when hunter is online.
  - Desktop HEX receives valid-key payloads in supported provider format.
- Continuity APIs
  - Profile resolve creates or reuses profile consistently.
  - Session creation works with device metadata.
  - Message push stores turns without breaking continuity reads.
  - Live session read/write keeps browser and working-memory fields intact.

## Automatable checks in this pass

- `node --check` across desktop and server JS
- `npm run test:contracts`
- `npm run build`
- IPC handler coverage search for recent broken routes
- Static review of chat send flow
- Static review of cloud continuity flow
- Static review of hunter valid-key bridge

## Manual checks left for later

- Real GUI interaction in running Electron window
- Voice loop and TTS/STT
- Live browser navigation and clicking
- True remote Cloudflare connectivity and auth from the packaged app
