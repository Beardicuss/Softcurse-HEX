# HEX Server Architecture

## Goal

Reduce local PC load and make HEX/Cardinal more coherent across turns by moving the memory and session brain into a Cloudflare-hosted backend, while keeping desktop control local.

## Local vs Remote Split

### Keep local

- Electron UI
- voice capture and playback
- system actions
- browser automation
- local short-lived cache

### Move remote

- profiles and IDs
- long-term memory
- conversation history
- active session state
- prompt assembly
- provider routing and observability

## Cloudflare Roles

- **Workers**: API and orchestration
- **Durable Objects**: active per-profile/per-session continuity state
- **D1**: profiles, sessions, messages, memories, preferences, personas
- **KV**: caches and lightweight config
- **R2**: exported logs, attachments, screenshots, artifacts
- **Queues**: summarization, memory extraction, background indexing
- **AI Gateway**: provider routing, retries, logging, spend and rate visibility

## Data Model

### Profiles

- `profile_id`
- `display_name`
- `language`
- `assistant_mode`
- `persona_id`

### Sessions

- `session_id`
- `profile_id`
- `device_id`
- `current_goal`
- `current_surface`
- `browser_url`
- `browser_title`
- `last_user_message`
- `last_assistant_message`

### Messages

- ordered chat history
- role
- content
- summary
- metadata

### Memories

- kind
- content
- confidence
- source session/message
- tags

## Immediate next integration tasks

1. Add backend URL and auth token settings to Electron config.
2. On name entry, create or resolve a remote profile.
3. On app boot, open or resume an active remote session.
4. Push each user/assistant turn to the backend.
5. Pull compact continuity context from backend before each model call.

## Why this should help

- smaller local prompt assembly
- stable per-user identity
- stronger follow-up handling
- less local summarization work
- future multi-device continuity
