# future_roadmap

Long-term upgrade ideas that are intentionally outside the current implementation sprint. This keeps the active roadmap focused while preserving bigger improvements for later.

## 1. Desktop HEX As A True Companion

- Build a deeper executive brain that separates conversation, planning, action execution, verification, and reflection.
- Add richer long-dialogue continuity with topic stacks, commitments, emotional state, corrections, and unresolved questions.
- Improve multilingual parity so English, Russian, and Georgian cover system alerts, identity names, voice prompts, settings, and dialogue tone.
- Add safer PC agency tiers: observe, read, open, modify, privileged, destructive.
- Add user-confirmed permissions for sensitive file access, credentials, security tools, deletion, installs, and account actions.
- Add verified action outcomes: HEX should know whether an action succeeded, failed, or needs user help.

## 2. Local Brain And Evolution Path

- Continue improving GOOD / WRONG / FIX feedback into clean SFT and preference datasets.
- Add dataset quality inspector, duplicate finder, language split, intent split, and export summaries.
- Add local training preparation scripts for future LoRA / QLoRA experiments when hardware allows.
- Keep local Qwen / llama.cpp as an optional helper, not a hard dependency.
- Explore lightweight local embedding memory for private facts and PC inventory.
- Add a future brain-worker boundary so expensive training/indexing can run outside the Electron UI.

## 3. HEX Server Future Upgrades

- Add conversation/session search and export.
- Add memory health dashboard: stale facts, duplicates, confidence, source, last-used time.
- Add device trust management, revocation, and audit timeline.
- Add context packet replay: inspect what packet Desktop HEX received for a past message.
- Add queue observability for summarization and memory extraction jobs.
- Add retention controls and safe deletion/export tools for user data.
- Add richer visual observability for server degraded states and last-good packets.

## 4. Hunter Future Upgrades

- Expand multi-source discovery with careful rate limits, source health, and legal/safety boundaries.
- Add source-specific dashboards for GrayHat, GitHub, GitLab, Gists, web text, and future sources.
- Add more provider detectors without hardcoding only common providers.
- Add validation queue visibility, stale key lifecycle, retry/backoff, and provider quota awareness.
- Add safer manual provider/key management with audit trails and copy/access logging.
- Add deployment and sync integration tests for the full Hunter -> HEX Server -> Desktop route.

## 5. Performance And Lightweight Mode

- Make Lite mode the default safe mode for laptops.
- Disable hidden visual effects, telemetry animations, heavy awareness loops, screenshots, and local engines unless needed.
- Make Voice/AGI surface suspend invisible panels and decorative effects while keeping wake-word and commands available.
- Add a performance dashboard with CPU/RAM pressure history and what HEX disabled to protect the PC.
- Move more heavy reasoning, continuity, and retrieval work to HEX Server where possible.

## 6. UI And Product Polish

- Continue unifying Desktop HEX with the refined HEX Server / Hunter visual language.
- Finish the Voice/AGI hologram polish with action/listening/speaking/error states.
- Add clearer onboarding, first-run registration, profile sync, and local/cloud privacy explanations.
- Add better settings organization and split large settings modules.
- Add accessible contrast and scalable layouts for laptop screens.

## 7. Personality Side Quest

- Explore and carefully analyze built-in HEX personalities and custom personality behavior.
- Verify personalities actually affect prompts, dialogue style, language behavior, and runtime switching.
- Fix broken personality activation, saving, deletion, persistence, and config sync if discovered.
- Audit and improve the personality adder / personality forger so custom personas are safe, clear, reusable, and cannot break core directives.
- Add tests or smoke checks proving built-in personalities, custom personalities, active badge, prompt injection, and personality forger work end-to-end.

## 8. Refactor And Test Debt

- Split remaining large renderer and settings files by domain.
- Split AI provider orchestration, prompt assembly, fallback policy, and response processing.
- Add contract tests for every preload bridge surface.
- Add smoke tests for startup, chat, browser actions, voice state, context packets, cloud degraded mode, and packaged build.
- Add final real-world validation scripts before release checkpoints.
