# HEX / Cardinal Upgrade Roadmap

Revised after completion of the standalone Softcurse Credential Hunter upgrade.

## Product Direction

HEX is a hybrid personal companion and PC butler. The important architectural rule is: provider APIs are only one brain source, not HEX itself. HEX must remain alive when every provider is down.

- Desktop HEX owns the always-on local reflex brain, conversation UX, local perception, voice, browser control, and OS actions.
- Local memory owns profile facts, corrections, preferences, recent context, action outcomes, and PC inventory.
- HEX Server owns identity, continuity, retrieval packets, device sync, durable memory, and cross-session intelligence.
- Hunter discovers and validates external provider capabilities upstream.
- Cloud and local models are routed through one model-agnostic brain router.

Raw provider secrets and broad PC data should not be pushed into prompts or exposed to the renderer. Each layer returns only the smallest decision or context required by the next layer.

## Completed Foundation

### Desktop

- Modular action handlers and smaller context and awareness modules.
- Safe chat rendering and consolidated preload bridge surfaces.
- Browser-session continuity and browser candidate follow-ups.
- File, folder, application, game, window, and process candidate resolution.
- Persisted lightweight PC inventory, known locations, and recent-entity promotion.
- Intent-aware window and process refresh loop.
- Warm-session state, local memory retrieval, and continuity prompt blocks.
- Cloud profile, session, message, inventory, and context-packet client integration.
- Brain Router v1 with local reflex, memory/status/profile answers, provider routing, and survival fallback.
- Local llama.cpp/Qwen lane with autostart support, final-answer sanitization, and hidden reasoning suppression.
- Wake-word voice flow with microphone autostart and HEX/Cardinal aliases.
- Feedback capture for GOOD, WRONG, and FIX into a local evolution JSONL dataset.

### HEX Server

- Profile and device identity.
- D1 conversation, session, and memory storage.
- Durable live-session continuity.
- Device inventory synchronization.
- Context and continuity packet endpoints.
- Hunter bridge and initial provider orchestration and cooldown reporting.
- Authenticated control-plane frontend.

### Hunter

- Multi-source bounded discovery and validation.
- Dynamic providers, source health, lifecycle, retention, and audits.
- GrayHat rotation, pagination, checkpoints, deduplication, and safe content limits.
- Valid-key bridge and manual or scheduled hunt controls.

## Phase 0 - Brain Independence And Survival Core

This is the new top priority for making HEX a real companion instead of an API-key toy.

- Keep an always-on local Brain Core that can answer basic dialogue, status, memory, and correction requests without any provider.
- Route every message through a brain router: local reflex, local action, memory answer, cloud/provider reasoning, or degraded survival response.
- Never show raw provider crash dumps as the assistant's final answer unless the user asks for diagnostics.
- Make memory retrieval mandatory before provider calls and available during provider failure.
- Save explicit corrections and remember-commands locally even when LLM extraction is unavailable.
- Add user feedback capture for good, wrong, and fixed answers as the dataset seed for later evolution.
- Stabilize the local inference lane for llama.cpp/Qwen and keep Ollama as an optional local engine.

Acceptance:

- If all API keys fail, HEX still responds coherently and can continue local PC/butler work.
- Basic greetings, status, memory questions, remember-commands, and corrections work offline.
- Provider errors are logged and summarized, not treated as the assistant's personality.
- The user can keep a conversation going while the model layer reconnects.

## Phase 1 - Stabilize The Three-Layer Contract

This is the immediate priority.

- Version the Hunter-to-HEX Server capability contract.
- Return capability, model inventory, validation freshness, and health without exposing keys to desktop HEX.
- Distinguish unavailable, invalid, rate-limited, exhausted, and temporarily degraded providers.
- Cache the last known-good Hunter capability pool with stale-while-revalidate behavior.
- Make desktop provider UI consume one canonical live capability packet.
- Remove remaining hardcoded provider and model assumptions.
- Add explicit degraded states for Hunter, HEX Server, and AI routing.

Acceptance:

- Newly validated Hunter capabilities become usable without reinstalling desktop HEX.
- Revoked keys are demoted without poisoning later prompts.
- Hunter downtime does not erase the last known-good provider pool.
- No raw provider key crosses into the renderer or logs.

## Phase 2 - Server Context Packet V2

- Return one compact packet containing active goal, unresolved tasks, recent turns, relevant memories, current entities, browser state, and device highlights.
- Rank context by recency, relevance, confidence, active surface, and entity category.
- Enforce strict budgets per section.
- Persist structured action outcomes and failures as an action timeline.
- Track commitments, corrections, pending follow-ups, and unresolved tasks.
- Reconcile restart and multi-device continuity.
- Queue memory extraction, summarization, deduplication, confidence updates, and pruning.

Acceptance:

- Follow-up dialogue survives restart and device changes.
- Referential requests resolve against the correct recent entity or action.
- Context remains compact and cannot recursively serialize itself.
- Server failure falls back to local continuity without blocking chat.

## Phase 3 - Dialogue And Executive Brain

- Track topic, intent, entities, emotional tone, commitments, and expected follow-up per turn.
- Separate conversation, planning, execution, and reflection.
- Preserve correction chains and short elliptical replies.
- Clarify only when confidence is low or an action is risky.
- Record compact post-action outcomes without recursive memory hooks.
- Provide full English, Russian, and Georgian dialogue parity.
- Keep profile and persona behavior consistent without repetitive phrasing.

Acceptance:

- Twenty-turn mixed conversations remain coherent.
- Browser and desktop actions can be discussed, executed, corrected, and resumed together.
- Language changes preserve identity, memory, alerts, and system wording.

## Phase 4 - Local Perception And Safe PC Agency

- Build incremental searchable indexes for applications, games, files, folders, and document metadata.
- Add recent-use signals and user-approved local text extraction.
- Track foreground apps and window-process relationships.
- Add action plans with preconditions, expected outcomes, verification, and rollback notes.
- Define observe, read, open, modify, privileged, and destructive permission tiers.
- Confirm destructive, credential, security-sensitive, and high-impact actions.
- Sync only safe local action summaries to HEX Server.

Acceptance:

- HEX answers what exists on the PC from indexed evidence rather than guessing.
- HEX verifies whether actions succeed and explains failures.
- Private file content stays local unless explicitly approved.

## Phase 5 - HEX Server Operations Frontend

- Live profile, device, session, and continuity views.
- Context-packet inspector with budgets and retrieval reasons.
- Memory health, deduplication, stale-memory, and queue views.
- Provider and Hunter health without raw key exposure.
- Device trust, revocation, permissions, and audit timeline.
- Conversation and session search and export.
- Clear degraded-state and last-success indicators.

## Phase 6 - Refactor And Cleanup

- Split ai.js into orchestration, provider execution, fallback policy, and response processing.
- Split settings-ui.js by panel with a dedicated live capability controller.
- Continue reducing renderer.js to startup coordination.
- Split remaining large main-process IPC files by domain.
- Remove dead aliases only after call-site verification.
- Add contract tests at preload, cloud, provider, and action boundaries.

## Phase 7 - Final Real-World Validation

- Automated syntax, unit, contract, and smoke checks.
- Development and packaged Electron startup tests.
- Long dialogue, restart continuity, and multilingual tests.
- Browser, files, apps, games, windows, processes, reminders, and voice tests.
- Hunter-to-server-to-desktop provider failover tests.
- Offline and degraded network, server, Hunter, and provider tests.
- Security review for renderer boundaries, secrets, device trust, and permissions.
- Performance and PC-load baseline comparison.

## Immediate Execution Order

1. Finish Phase 1: audit and harden the Hunter-to-HEX Server capability contract, including stale-while-revalidate and degraded-state handling.
2. Finish Phase 1: make server provider orchestration authoritative and secret-safe across desktop AI, settings, and runtime fallback.
3. Continue Phase 2: strengthen Context Packet V2 retrieval ranking, action outcomes, unresolved tasks, and correction chains.
4. Start Phase 3: improve dialogue/executive brain so long conversations, emotions, commitments, and follow-ups remain coherent.
5. Continue Phase 4: deepen local PC perception with safer indexes, action verification, and permission tiers.
6. Build Phase 5: HEX Server operations frontend for profile, continuity, memory, provider health, device trust, and audits.
7. Continue Phase 6: split ai.js, settings-ui.js, renderer.js, and remaining large IPC modules.
8. Run Phase 7 as the final real-world validation gate.

## Definition Of Complete

HEX is ready when it can sustain coherent multilingual dialogue, remember and resume meaningful work, reason from current browser and PC state, safely execute and verify local actions, keep functioning when every provider fails, learn from corrections and feedback, recover from server or Hunter downtime, and explain what it knows, inferred, and could not verify.
## Current Stop Point - June 23, 2026

Phase 0 is functionally implemented but still needs broader real-world testing. The active stop point is between Phase 1 and Phase 2:

- Desktop HEX now has Brain Router v1, local survival responses, local feedback capture, llama.cpp/Qwen support, hidden-reasoning cleanup, and microphone wake-word startup.
- The next highest-risk work is not another UI polish pass; it is contract reliability between Hunter, HEX Server, and Desktop HEX.
- The next implementation phase should focus on canonical capability packets, degraded-state handling, and stale-while-revalidate provider orchestration before deeper dialogue planning.

Roadmap update required: yes. The previous Phase 0 wording treated llama.cpp as future work. It is now part of the completed foundation, so the roadmap priority shifts to Phase 1 contract hardening and Phase 2 context-packet reliability.


