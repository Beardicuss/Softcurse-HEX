# Softcurse H.E.X. Refactor and Stabilization Plan

## Summary
Use a **stabilize first** plan with **minimal architecture change** in phase 1: keep Electron + vanilla scripts, preserve current behavior, and fix the highest-risk bugs before splitting files. The work will be done in four phases so the refactor does not hide regressions.

Priority order:
1. Fix critical runtime and security issues.
2. Split oversized scripts into smaller modules without changing user-facing behavior.
3. Remove dead code, duplicates, and stale zones.
4. Run smoke and critical-path validation after each phase.

## Implementation Changes
### Phase 1: Stabilize the current app before refactoring
- Replace unsafe chat/message rendering with a **safe renderer utility** that never injects model or scraped text through `innerHTML`.
- Convert inline UI handlers used by chat/toasts/plugin cards to **event delegation** so the renderer can stop relying on inline script execution.
- Tighten the renderer boundary:
  - unify `window.hexAPI.plugins` into one object;
  - keep these methods available in one stable surface: `list`, `discover`, `load`, `unload`, `execute`, `getActionTags`, `openFolder`, `installLocal`, `remove`;
  - standardize browser actions under `window.hexAPI.browser.{open,search,scrape}` and remove mismatched ad-hoc calls.
- Fix packaged build drift:
  - include bundled sample plugins in packaging;
  - keep plugin bootstrap behavior identical in dev and packaged builds.
- Preserve all existing commands, AI action tags, and UI flows unless a path is clearly dead or broken.

### Phase 2: Cut the large scripts into smaller modules without losing logic
- Turn `main.js` into a small bootstrap plus domain modules:
  - app/window lifecycle
  - config and encrypted key storage
  - telemetry/polling
  - reminders/schedules
  - voice IPC
  - butler/system actions
  - plugin management
  - browser/web-agent IPC
  - face auth
  - clipboard/history
  - hunter/background jobs
- Turn `preload.js` into composable bridge builders:
  - config/system
  - butler
  - browser/web
  - plugins
  - voice
  - memory/brain
  - events
  - compose once into a single exported `hexAPI`.
- Turn `src/js/renderer.js` into a coordinator only:
  - app init/bootstrap
  - chat rendering
  - toast/log UI
  - telemetry/vitals UI
  - message send pipeline
  - shared DOM/event helpers
- Split other oversized renderer modules by behavior:
  - `actions.js`: app/file/system/browser/plugin/media actions
  - `memory.js`: persistence, graph storage, retrieval, extraction, pruning
  - `ai.js`: provider routing, provider clients, fallback policy, action parsing
  - `settings-ui.js`: general, AI, voice, plugins, security panels
- Keep module boundaries behavioral, not cosmetic: each extracted module must own one concern and expose a small API back to the coordinator.

### Phase 3: Dead code, duplicates, bugs, and stale zones audit
- Run a repo-wide audit for:
  - duplicate bridge methods and overwritten keys;
  - unused renderer helpers and dead action branches;
  - unreachable plugin/browser APIs;
  - stale aliases that no caller uses;
  - dead UI zones and orphaned assets;
  - mismatched docs/config/package behavior.
- Remove duplicates only after confirming the surviving path is the one used everywhere.
- Normalize repeated utility logic into single shared helpers:
  - HTML escaping/rendering
  - shell/command execution wrappers
  - logging/toast formatting
  - reminder/schedule persistence helpers
- Treat these as mandatory fixes from the earlier analysis:
  - unsafe message rendering;
  - duplicated `plugins` bridge definition;
  - broken browser-search call path;
  - packaged plugins not being shipped.

### Phase 4: Validation and acceptance
- After each phase, run:
  - `node --check` for all JS entry files/modules;
  - app startup smoke check;
  - plugin discovery/load/unload smoke check;
  - browser open/search/scrape smoke check;
  - reminder/schedule smoke check;
  - voice status/init smoke check.
- Before closing the work, verify these end-to-end scenarios:
  - normal chat message and AI response rendering;
  - AI response containing markdown-like formatting;
  - plugin action tags available to the renderer and executable;
  - browser search path works without fallback errors;
  - packaged build still boots and bundled plugins appear;
  - memory load/save still works across restart.

## Public APIs and Interface Rules
- Preserve the existing `window.hexAPI` contract as the public renderer bridge.
- Consolidate `window.hexAPI.plugins` into one canonical interface; no duplicate keys.
- Standardize browser operations on `window.hexAPI.browser`.
- Do not change user-facing command phrases, reminder syntax, or plugin manifest format in this refactor.
- Do not introduce a bundler, framework migration, or TypeScript conversion in this plan.

## Test Plan
- Syntax validation for all extracted modules.
- Manual smoke coverage for:
  - startup
  - chat
  - safe message rendering
  - plugin management
  - browser actions
  - reminders
  - voice status
  - memory persistence
- Regression focus on the exact bugs already found:
  - no HTML/script injection from model output;
  - `plugins.getActionTags()` available again;
  - plugin reload/remove UI works;
  - browser search uses the correct bridge;
  - packaged build contains bundled plugins.

## Assumptions and Defaults
- Default strategy: **preserve current architecture**, not a major redesign.
- Default order: **critical fixes first**, then refactor, then cleanup.
- Validation bar: **smoke plus critical-path checks**, not a full new test harness.
- The goal is behavior parity plus bug fixes, not feature expansion.
- Any code proven unused during the audit can be removed, but ambiguous paths should first be marked as candidates and verified through call-site search before deletion.
