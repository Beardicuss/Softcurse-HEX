# HEX Server Core

Cloudflare-hosted backend for `Softcurse Hex` / `Cardinal`.

## Purpose

This service is the planned remote brain layer for:

- profile identity
- session continuity
- long-term memory
- conversation history
- provider routing / AI Gateway integration

Desktop control, browser automation, voice I/O, and OS actions stay local in Electron.

## Stack

- Cloudflare Workers
- D1
- Durable Objects
- KV
- R2
- Queues

## Current scaffold

- `src/index.js`
  Worker API with starter routes for health, bootstrap, profiles, sessions, and live session state
- `schema.sql`
  initial D1 schema
- `public/`
  control-site frontend in HEX/Cardinal mixed visual style
- `wrangler.jsonc`
  resource bindings template

## Local development

1. Create the Cloudflare resources:
   - D1 database
   - KV namespace
   - R2 bucket
   - Queue
2. Replace placeholder IDs in `wrangler.jsonc`
3. Run:

```bash
npx wrangler dev
```

## Recommended implementation order

1. Connect Electron HEX to `/api/profiles`
2. Move session continuity writes to Durable Objects
3. Mirror local chat turns into `/api/sessions/:id/messages`
4. Move memory retrieval and summarization to the server
5. Route external model calls through Cloudflare AI Gateway
