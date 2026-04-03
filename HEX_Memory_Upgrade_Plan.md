# H.E.X. Memory Architecture — Full Upgrade Plan

> **Version:** 2.0 Design Specification  
> **Scope:** Complete overhaul of the H.E.X. persistent memory system  
> **Goal:** Transform H.E.X. from keyword-based fact storage into a living, intelligent personal knowledge graph

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Audit](#2-current-system-audit)
3. [Core Architecture Redesign](#3-core-architecture-redesign)
4. [Layer 1 — Semantic Vector Store](#4-layer-1--semantic-vector-store)
5. [Layer 2 — Temporal Knowledge Graph](#5-layer-2--temporal-knowledge-graph)
6. [Layer 3 — Episodic Memory Store](#6-layer-3--episodic-memory-store)
7. [Layer 4 — Working Memory Buffer](#7-layer-4--working-memory-buffer)
8. [Upgraded Extraction Engine](#8-upgraded-extraction-engine)
9. [Conflict Resolution & Validation](#9-conflict-resolution--validation)
10. [Tiered Eviction Policy](#10-tiered-eviction-policy)
11. [Hybrid Retrieval System](#11-hybrid-retrieval-system)
12. [Dynamic Context Builder](#12-dynamic-context-builder)
13. [Meta-Memory & Self-Awareness](#13-meta-memory--self-awareness)
14. [Emotional & Contextual State Tracking](#14-emotional--contextual-state-tracking)
15. [Privacy & Security Architecture](#15-privacy--security-architecture)
16. [Storage Schema Specification](#16-storage-schema-specification)
17. [Implementation Roadmap](#17-implementation-roadmap)
18. [Performance Targets](#18-performance-targets)

---

## 1. Executive Summary

The current H.E.X. system is a **keyword-triggered flat fact store** with rolling conversation history. It works, but it has fundamental limitations: brittle extraction, no understanding of relationships between facts, no concept of time, and a naive deduplication algorithm that allows contradictory facts to coexist.

This plan describes a complete redesign into a **four-layer intelligent memory system** with:

- LLM-powered semantic extraction instead of keyword triggers
- Vector embeddings for true semantic deduplication
- A temporal knowledge graph that tracks how facts evolve over time
- Episodic compression of conversation history into structured session memories
- A working memory layer for context within an active session
- Hybrid retrieval that injects only what is *relevant* to the current message, not everything
- A conflict resolver that detects and archives contradictory beliefs
- A tiered eviction policy with protected, identity-level facts
- Meta-memory: the system knows what it knows, what it's uncertain about, and what it has forgotten

---

## 2. Current System Audit

### What exists

| Component | Implementation | Quality |
|---|---|---|
| Fact storage | Flat JSON list | Functional but fragile |
| Extraction | Keyword/phrase triggers | Misses most implicit info |
| Deduplication | Word-overlap ≥75% | Fails on semantic synonyms and contradictions |
| Confidence scoring | 0.0–1.0 float per fact | Good idea, weak input signal |
| History | Last 120 turns raw | Too large, no filtering |
| Summary | Rolling LLM summary | Good, but single point of failure |
| Retrieval | Inject all facts every time | Wasteful, context-polluting |
| Eviction | Confidence-based at 200-fact cap | Risks losing important low-mention facts |

### Root problems

**Problem 1: Extraction quality**
Keyword triggers catch only explicit statements. The vast majority of what a user reveals about themselves is *implicit* — behavioral, contextual, or embedded in how they phrase things, not what they say.

**Problem 2: Flat structure**
Facts have no relationships to each other. The system cannot reason that "prefers terminal-based tools" and "uses Neovim" and "avoids GUI" are all expressions of the same underlying user profile cluster.

**Problem 3: No time dimension**
A preference expressed eighteen months ago sits alongside one expressed yesterday with no way to distinguish them. People change. The system cannot.

**Problem 4: Naive deduplication**
Word overlap scores fail when two statements are semantically equivalent but lexically different, or when two statements are factually contradictory but lexically similar.

**Problem 5: Dump-all retrieval**
Injecting every known fact into every context window pollutes the LLM's attention, wastes tokens on irrelevant information, and will hit context limits at scale.

---

## 3. Core Architecture Redesign

The upgraded system consists of four storage layers, each with a distinct purpose and access pattern, plus a pipeline that connects them.

```
User message
     │
     ▼
┌─────────────────────────────────┐
│   EXTRACTION ENGINE (LLM)       │  ← replaces keyword triggers
│   Semantic NLU + intent parser  │
└────────┬────────┬───────────────┘
         │        │
  facts  │        │  episode
         ▼        ▼
┌──────────────┐  ┌──────────────────┐
│ LAYER 1      │  │ LAYER 3          │
│ Semantic     │  │ Episodic Store   │
│ Vector Store │  │ (sessions)       │
└──────┬───────┘  └──────────────────┘
       │
┌──────▼───────────────────────────┐
│ LAYER 2                          │
│ Temporal Knowledge Graph         │  ← core upgrade
│ (nodes = facts, edges = context) │
└──────┬───────────────────────────┘
       │
┌──────▼────────────────┐
│ CONFLICT RESOLVER     │  ← new
│ + VALIDATOR           │
└──────┬────────────────┘
       │
┌──────▼──────────────────────────┐
│ TIERED EVICTION POLICY          │  ← upgraded
│ Protected / Active / Evictable  │
└──────┬──────────────────────────┘
       │
┌──────▼──────────────────────────┐
│ HYBRID RETRIEVAL ENGINE         │  ← replaces dump-all
│ Semantic + recency + relevance  │
└──────┬──────────────────────────┘
       │
┌──────▼──────────────────────────┐
│ DYNAMIC CONTEXT BUILDER         │  ← token-budget aware
│ Graph summary + facts + history │
└──────┬──────────────────────────┘
       ▼
    LLM call
```

---

## 4. Layer 1 — Semantic Vector Store

### Purpose
Enable true semantic similarity search across all stored facts. Replace word-overlap deduplication with embedding-space comparison.

### How it works

Every extracted fact is run through a local embedding model (e.g., `nomic-embed-text`, `all-MiniLM-L6-v2`, or the host LLM's embedding endpoint) and stored as a high-dimensional vector alongside the fact text.

When a new fact is extracted, its embedding is compared against existing facts using cosine similarity:

- **Similarity ≥ 0.92** → treat as duplicate, merge/update the existing fact
- **Similarity 0.75–0.92** → treat as potentially related, flag for conflict check
- **Similarity < 0.75** → treat as new fact, store independently

### Why this matters over word-overlap

| Statement A | Statement B | Word overlap | Cosine similarity | Correct action |
|---|---|---|---|---|
| "I prefer dark mode" | "I always use dark themes" | ~0.2 (low) | ~0.88 (high) | Merge → same fact |
| "I prefer dark mode" | "I switched to light mode" | ~0.5 (medium) | ~0.71 (medium-low) | Conflict → flag |
| "I work in Python" | "I code in Python" | ~0.33 | ~0.91 | Merge → same fact |
| "I code in Python" | "I code in Go now" | ~0.5 | ~0.65 | Conflict → flag |

Word overlap would fail all four of these. Embeddings handle them correctly.

### Local embedding options

Use a small, fast local model to avoid latency and privacy concerns:

- `nomic-embed-text` (274M params, runs on CPU, 768-dim vectors)
- `all-MiniLM-L6-v2` (22M params, 384-dim, very fast)
- The host LLM's own embedding API if exposed

Vector index: use a flat index (exact search) for <5000 facts. Switch to HNSW approximate search at scale. Libraries: `hnswlib` (Python), `usearch` (C++), or `faiss` (if GPU available).

---

## 5. Layer 2 — Temporal Knowledge Graph

### Purpose
Store facts not as a flat list but as a connected graph where relationships and time are first-class properties. This is the most significant architectural upgrade.

### Node types

Every fact becomes a **node** with the following properties:

```json
{
  "id": "node_a4f3c",
  "type": "preference",
  "content": "prefers dark mode UI",
  "confidence": 0.87,
  "created_at": "2024-11-04T22:14:00Z",
  "last_confirmed_at": "2025-03-12T18:30:00Z",
  "mention_count": 7,
  "status": "active",
  "vector": [0.021, -0.134, ...],
  "tier": "high-confidence",
  "protected": false,
  "source_session_ids": ["sess_001", "sess_047", "sess_082"]
}
```

### Edge types

Edges encode the relationship between facts:

| Edge type | Meaning | Example |
|---|---|---|
| `implies` | One fact implies another | `uses Neovim` → implies → `comfortable with terminal` |
| `contradicts` | Facts are in conflict | `prefers dark mode` ↔ contradicts ↔ `switched to light mode` |
| `supersedes` | Newer fact replaces older | `works in Python 3.10` → supersedes → `works in Python 3.8` |
| `belongs_to` | Fact is part of a cluster | `avoids GUI tools` → belongs_to → `developer workflow profile` |
| `co-occurs_with` | Facts are often mentioned together | `late-night work habit` ↔ co-occurs ↔ `prefers quiet focus time` |
| `sourced_from` | Fact came from a specific project/task | `uses Docker Compose` → sourced_from → `task: home server project` |

### Cluster nodes

Automatically generated higher-level summary nodes that group related facts:

```json
{
  "id": "cluster_dev_workflow",
  "type": "cluster",
  "label": "Developer workflow profile",
  "summary": "User is a terminal-first developer who prefers lightweight tools, codes primarily in Python and Go, works late at night, and avoids GUI-heavy applications.",
  "member_node_ids": ["node_a4f3c", "node_b22d1", "node_f88a2", ...],
  "last_regenerated_at": "2025-04-01T10:00:00Z"
}
```

Clusters are regenerated periodically (e.g., once per 10 new facts added) using a short LLM call.

### Temporal reasoning

Because every node has `created_at` and `last_confirmed_at`, the retrieval system can apply temporal decay:

```
effective_confidence = base_confidence × decay_factor(age_days)

decay_factor(d) = 1.0                  if d < 30    (recent)
               = 1.0 - 0.003 × (d-30) if d < 200   (slowly fading)
               = max(0.3, ...)          after 200    (floor: never fully forgotten)
```

Stable identity-level facts (name, occupation, OS) have decay disabled. Behavioral and preference facts decay slowly. Task-specific facts decay faster.

---

## 6. Layer 3 — Episodic Memory Store

### Purpose
Store compressed representations of past sessions, preserving the *narrative* of what happened across conversations — not just the facts extracted from them.

### Session record structure

At the end of every session (or when a session exceeds 30 turns), H.E.X. generates an episodic record:

```json
{
  "session_id": "sess_082",
  "started_at": "2025-03-28T21:00:00Z",
  "ended_at": "2025-03-28T23:44:00Z",
  "duration_turns": 47,
  "topics": ["home server setup", "Docker networking", "Nginx reverse proxy"],
  "emotional_tone": "focused, slightly frustrated mid-session, resolved at end",
  "outcomes": [
    "User successfully configured Nginx with SSL",
    "User decided to use Caddy instead of Nginx for future projects"
  ],
  "new_facts_extracted": ["node_f88a2", "node_g01c3"],
  "facts_reinforced": ["node_b22d1"],
  "facts_contradicted": [],
  "raw_summary": "Long working session on home server. User was setting up reverse proxy for multiple services. Hit an issue with HTTPS certificates and Let's Encrypt. Tried Certbot, had permission problems. Switched to Caddy which auto-handled TLS. Ended satisfied. User mentioned they'll use Caddy for all future projects.",
  "compressed": true
}
```

### Why separate from the knowledge graph

The graph stores *what is true* about the user.  
Episodic memory stores *what happened* and *in what context*.

These are different. The graph tells H.E.X. that the user knows Docker. Episodic memory tells H.E.X. that the user learned Caddy after a frustrating experience with Certbot on a Saturday night — context that is deeply useful for understanding future questions.

### Episodic retrieval

When the user starts a session, H.E.X. does a semantic search over episode summaries using the first message as a query. Relevant past sessions are surfaced and their summaries prepended to context, e.g.:

> *"Three weeks ago, you set up a reverse proxy on your home server. You settled on Caddy after struggling with Nginx certificate management."*

---

## 7. Layer 4 — Working Memory Buffer

### Purpose
A fast, in-RAM store for facts that are relevant *only within the current session*. Not persisted to disk. Cleared on session end.

### What goes in working memory

- Entities mentioned in this conversation (`current_project`, `current_file`, `current_error`)
- Transient preferences expressed this session ("actually, just give me short answers today")
- Hypotheses formed mid-conversation ("user seems to be building a REST API")
- Pending confirmations ("user said they might switch to TypeScript — not confirmed yet")

### Structure

```json
{
  "working_memory": {
    "current_task": "setting up CI/CD pipeline with GitHub Actions",
    "current_language": "Python",
    "active_entities": ["repo: my-flask-app", "file: .github/workflows/deploy.yml"],
    "session_preferences": ["be concise", "skip boilerplate explanations"],
    "hypotheses": [
      {
        "belief": "user is deploying to a VPS, not a cloud provider",
        "confidence": 0.7,
        "evidence": "mentioned SSH and systemd in last 3 messages"
      }
    ],
    "pending_facts": [
      {
        "content": "might switch from Flask to FastAPI",
        "status": "unconfirmed",
        "mentioned_at_turn": 14
      }
    ]
  }
}
```

Working memory is injected at higher priority than long-term facts in the context block. It is the most immediately relevant information.

---

## 8. Upgraded Extraction Engine

### Current approach: keyword triggers

```
if message contains "my name is" → extract user.name
if message contains "I love" → extract preference
```

This misses everything that isn't explicitly stated.

### Upgraded approach: LLM extraction with structured output

After every user message (and optionally after every assistant response), run a small, fast extraction call:

**System prompt:**
```
You are a memory extraction system. Analyze the user's message and extract any facts about the user.

Return a JSON object with this structure:
{
  "facts": [
    {
      "type": "user|preference|habit|task|system|relationship|belief|skill",
      "content": "clear statement of the fact",
      "confidence": 0.0-1.0,
      "implicit": true/false,
      "temporal": "current|past|future|unknown",
      "contradicts_hint": "brief description of what this might contradict, or null"
    }
  ],
  "working_memory_updates": {
    "current_task": "...",
    "current_entities": [...],
    "hypotheses": [...]
  },
  "nothing_to_extract": true/false
}

Only extract facts about the USER, not general knowledge. Be conservative with confidence. 
Set implicit=true if the fact was inferred rather than stated directly.
Return nothing_to_extract=true if there are genuinely no user-relevant facts.
```

**User message example:**
> *"ugh, I've been staring at this CSS flexbox bug for two hours and I still can't get the items to center properly"*

**Extracted:**
```json
{
  "facts": [
    {
      "type": "skill",
      "content": "works with CSS and frontend development",
      "confidence": 0.85,
      "implicit": true,
      "temporal": "current"
    },
    {
      "type": "habit",
      "content": "persists on problems for extended periods before asking for help",
      "confidence": 0.55,
      "implicit": true,
      "temporal": "unknown"
    },
    {
      "type": "preference",
      "content": "finds CSS layout frustrating or difficult",
      "confidence": 0.6,
      "implicit": true,
      "temporal": "current"
    }
  ],
  "working_memory_updates": {
    "current_task": "fixing CSS flexbox centering issue"
  }
}
```

None of these would have been extracted by keyword triggers.

### Extraction model choice

Use a small, fast model for extraction to minimize latency:
- `claude-haiku-3` or equivalent
- `phi-3-mini` locally
- Dedicated fine-tuned extraction model (ideal long-term)

Extraction adds ~150-300ms per message. This is acceptable if run asynchronously after the main response is streamed.

### Bidirectional extraction

Also extract from **assistant responses**, not just user messages:

- If H.E.X. infers something about the user and states it ("Sounds like you're working on a Python backend") — that inference should be logged as a hypothesis in working memory
- If the user corrects the inference ("Actually it's Node.js") — the correction should override immediately

---

## 9. Conflict Resolution & Validation

This is a new component with no equivalent in the current system.

### Conflict types

**Type 1 — Direct contradiction**
```
fact A: "prefers dark mode"
fact B: "switched to light mode for eye strain"
```
Resolution: B supersedes A. A is archived with `status: "superseded"`, not deleted.

**Type 2 — Temporal drift**
```
fact A: "works primarily in Python"  (created: 2024-01-10)
fact B: "learning Rust full-time"    (created: 2025-02-20)
```
Resolution: Both are kept. A's weight is reduced. B is marked `temporal: "current"`. The graph edge `B supersedes A` is created.

**Type 3 — Confidence contradiction**
```
fact A: "works at a startup"  (confidence: 0.9, mentions: 12)
fact B: "works at a large enterprise"  (confidence: 0.4, mentions: 2)
```
Resolution: Flag for human confirmation in the MEMORY tab. Present both to user: *"I have conflicting information about your employer — can you clarify?"*

**Type 4 — Scope mismatch**
```
fact A: "hates meetings"  (general preference)
fact B: "really enjoyed today's team standup"  (single event)
```
Resolution: Not a conflict. B gets scope tag `temporal: "past"`, `scope: "single_event"`. A is unchanged.

### Resolution pipeline

```
New fact extracted
        │
        ▼
Embedding similarity search → candidates
        │
        ▼
LLM conflict classifier:
  - Same fact? → merge
  - Contradiction? → supersede + archive older
  - Scope difference? → keep both with scope tags
  - Uncertain? → flag for user confirmation
        │
        ▼
Write to knowledge graph with appropriate edge type
```

### Archived facts

Superseded facts are **never deleted** — they move to `status: "archived"`. This is important because:

1. The user might revert (switched back to dark mode after trying light)
2. The history of a user's beliefs is itself informative
3. It enables future analytics ("your preferences changed significantly in early 2025")

---

## 10. Tiered Eviction Policy

### The problem with the current approach

Evicting by confidence alone risks losing facts that were mentioned only once but are critically important (a health condition, a key constraint on a project).

### Three-tier system

**Tier 0 — Protected (never evicted)**

Facts that belong to core identity. Hard-coded category rules:

- `type: "user"` → name, profession, location, family
- `type: "system"` → OS, hardware, critical software setup
- `type: "health"` → any medical, dietary, or accessibility info
- Any fact the user has manually pinned in the MEMORY tab
- Any fact with `mention_count > 20`

**Tier 1 — High-confidence (evicted only under extreme pressure)**

- `confidence > 0.7` AND `mention_count > 5`
- Recent facts (created within 30 days)
- Facts that are part of an active task node

Evicted only when the store exceeds 150% of the target limit.

**Tier 2 — Active (normal eviction candidates)**

- `confidence 0.4–0.7`
- Mentioned 2–5 times
- Not part of an active task

Evicted when the store exceeds the target limit (default: 500 facts).

**Tier 3 — Weak (evicted first)**

- `confidence < 0.4`
- Mentioned only once
- Age > 90 days with no confirmation
- `temporal: "past"` facts that have been superseded

### Eviction selection

When eviction is needed, score each candidate:

```
eviction_score = (1 - confidence) × (1 / recency_boost) × (1 - mention_weight)

recency_boost = 1 + log(1 + days_since_created / 30)
mention_weight = min(1.0, mention_count / 20)
```

Evict highest-scoring facts first. Before eviction, generate a one-line `eviction_summary` and append it to the rolling summary so the information is not completely lost.

### User-configurable limits

| Parameter | Default | User can set |
|---|---|---|
| Total fact cap | 500 | 200–2000 |
| Protected tier | always on | can expand categories |
| Eviction threshold | 90% of cap | 70%–100% |
| Decay rate | standard | fast / standard / slow / off |

---

## 11. Hybrid Retrieval System

### Current approach: inject everything

Every prompt gets the full fact list. This is wasteful and gets worse as the system scales.

### Upgraded approach: relevance-scored retrieval

Every incoming user message is embedded and used to query the memory layers:

**Step 1 — Working memory** (always injected, highest priority)
Current session context. ~200-400 tokens.

**Step 2 — Semantic fact search** (top-k relevant facts)
Embed the user message → cosine similarity search over all fact vectors → return top 15-20 facts by similarity score.

**Step 3 — Graph neighborhood expansion**
For each top-k fact returned, also return its direct graph neighbors (1-hop). This captures related facts that might not have been in the top-k directly but are contextually linked.

**Step 4 — Recency boost**
Re-score the combined candidate set with a recency term:

```
final_score = (0.6 × semantic_similarity) + (0.3 × recency_score) + (0.1 × mention_weight)
```

**Step 5 — Cluster injection**
If the top-k facts mostly belong to one cluster, inject the cluster summary node as a compact overview instead of every individual fact.

**Step 6 — Episodic episode match**
Embed the user message → search episodic session summaries → if relevant episode found (similarity > 0.7), append a 1-2 sentence episodic recall.

### Result

Instead of injecting 200 facts for a question about Python, H.E.X. injects:

- Working memory: current task context
- Top 8 semantically relevant facts to the message
- 2 graph neighbors that provide useful context
- 1 cluster summary for the relevant profile cluster
- 1 relevant episode summary if applicable

Total: ~600-900 tokens of memory context instead of 2000+, and every token is relevant.

---

## 12. Dynamic Context Builder

### Token budget management

The context builder is model-aware. It knows the context window of the target model and dynamically scales memory injection:

| Model context window | Memory budget | History budget |
|---|---|---|
| 4K tokens | 400 tokens | 600 tokens |
| 8K tokens | 800 tokens | 1500 tokens |
| 32K tokens | 1500 tokens | 6000 tokens |
| 128K+ tokens | 3000 tokens | 20000+ tokens |

### Context block structure

```
[SYSTEM CONTEXT BLOCK]

## Who you are talking to
{cluster summaries for the user's top 2-3 profile clusters}

## Current session context
{working memory: current task, entities, session preferences}

## Relevant facts
{top-k retrieved facts, formatted as natural language statements}
{format: "User prefers X (high confidence)" or "User might prefer X (uncertain)"}

## Relevant past context
{episodic recall if applicable: "In a past session, you helped the user with..."}

## Recent conversation
{last N turns, scaled to available token budget}
```

### Confidence-aware formatting

Facts are formatted differently based on their confidence:

```
High confidence (>0.8):  "User works as a backend developer."
Medium confidence (0.5–0.8): "User appears to prefer minimal tooling."
Low confidence (<0.5):   "User may be transitioning from Python to Go — unconfirmed."
```

This prevents H.E.X. from asserting uncertain information confidently to the LLM.

---

## 13. Meta-Memory & Self-Awareness

A new capability: H.E.X. tracks what it knows, what it doesn't know, and how its knowledge has changed.

### Self-knowledge index

H.E.X. maintains a high-level summary of its own memory state, regenerated periodically:

```json
{
  "self_knowledge": {
    "known_well": ["technical skills", "tool preferences", "work schedule patterns"],
    "known_partially": ["personal life", "long-term goals", "current employer details"],
    "not_known": ["financial situation", "physical location", "family specifics"],
    "recent_changes": ["switched from dark to light mode (March 2025)", "started learning Rust (Feb 2025)"],
    "most_confident_facts": ["node_a4f3c", "node_b22d1", "node_c99e0"],
    "least_confident_facts": ["node_x11f2", "node_y44g1"],
    "last_full_audit_at": "2025-04-01T00:00:00Z"
  }
}
```

### Proactive gap detection

When the user asks a question that touches an area H.E.X. knows little about, it can proactively ask:

> *"I don't actually know much about your deployment setup. Are you hosting this on a VPS, a cloud provider, or locally?"*

This transforms H.E.X. from passive (only learns when told) to active (seeks out missing knowledge when relevant).

### Memory health reports

Weekly summary shown in the MEMORY tab:

> *"This week I learned 12 new facts about your work on the home server project. I updated 3 existing facts (your Python version preference changed). I've noticed you haven't mentioned your freelance work in 60 days — that information is aging out."*

---

## 14. Emotional & Contextual State Tracking

Not clinical sentiment analysis — subtle tracking of context that affects how H.E.X. should respond.

### What gets tracked

**Session mood/energy signals** (working memory only, not persisted)
- Frustration signals: short messages, repeated questions, explicit complaints
- Focus signals: long technical messages, code blocks, sustained single topic
- Exploratory signals: rapid topic switching, "what if" questions

**Long-term patterns** (persisted as habit facts)
- Time of day patterns: "usually active between 9pm–2am"
- Session length patterns: "typically works in 2-3 hour focused blocks"
- Topic recurrence: "returns to the same unresolved problem across multiple sessions"

### Usage in context building

Session mood signals are passed to the LLM as soft guidance, not hard instructions:

> *"Note: User seems frustrated in this session (short messages, repeated attempts). Prioritize clear, direct answers over explanations."*

This is never asserted as fact — it's a real-time inference. The LLM can disregard it if the actual message doesn't support it.

---

## 15. Privacy & Security Architecture

### Encryption at rest

`memory.json` should be encrypted using the OS keychain or a user-provided passphrase:

- Windows: DPAPI (Data Protection API) via `%AppData%`
- macOS: Keychain Services
- Linux: libsecret / GNOME Keyring, or `age` file encryption

### Fact redaction

Any fact containing PII patterns (email addresses, phone numbers, specific addresses) should be:
1. Flagged on extraction
2. Stored in a separate `pii_facts` section
3. Excluded from cloud sync if H.E.X. ever adds sync
4. Redacted from any export unless explicitly requested

### Export & portability

Users should be able to:

```
Export options:
├── memory_export_full.json     (everything, including archived and PII)
├── memory_export_facts.json    (facts only, no history)
├── memory_export_readable.txt  (human-readable summary of all known facts)
└── memory_wipe_confirmation.txt (audit log of what was wiped and when)
```

### Audit log

Every fact write, update, eviction, and manual deletion is logged:

```json
{
  "audit_log": [
    {
      "timestamp": "2025-04-01T22:14:00Z",
      "action": "fact_created",
      "fact_id": "node_a4f3c",
      "source": "extraction_engine",
      "session_id": "sess_082"
    },
    {
      "timestamp": "2025-03-12T18:30:00Z",
      "action": "fact_superseded",
      "fact_id": "node_x11f2",
      "superseded_by": "node_a4f3c",
      "reason": "conflict_resolution"
    }
  ]
}
```

---

## 16. Storage Schema Specification

### File layout

```
%AppData%\Roaming\Softcurse Hex\
├── memory.json              ← main store (encrypted)
├── memory_index.hnsw        ← vector index for semantic search
├── memory_audit.log         ← append-only audit log
├── sessions\
│   ├── sess_001.json
│   ├── sess_002.json
│   └── ...
└── exports\
    └── (user-generated exports)
```

### `memory.json` top-level structure

```json
{
  "schema_version": "2.0",
  "created_at": "2024-11-01T00:00:00Z",
  "last_modified_at": "2025-04-01T22:14:00Z",

  "meta": { ... },

  "knowledge_graph": {
    "nodes": [ ... ],
    "edges": [ ... ],
    "clusters": [ ... ]
  },

  "working_memory": { ... },

  "self_knowledge": { ... },

  "settings": {
    "fact_cap": 500,
    "decay_enabled": true,
    "decay_rate": "standard",
    "embedding_model": "all-MiniLM-L6-v2",
    "extraction_model": "haiku",
    "protected_categories": ["user", "health", "system"]
  }
}
```

---

## 17. Implementation Roadmap

### Phase 1 — Foundation (Weeks 1–4)
*Make the existing system structurally sound*

- [ ] Add `created_at` and `last_confirmed_at` timestamps to all existing facts
- [ ] Add `tier` classification to all existing facts (manual rule-based, not yet ML)
- [ ] Implement tiered eviction policy with protected tier
- [ ] Add conflict detection (simple keyword-based, not yet semantic) as a stopgap
- [ ] Split raw history storage into session files

### Phase 2 — Semantic Core (Weeks 5–10)
*Replace word-overlap with real semantics*

- [ ] Integrate local embedding model (all-MiniLM-L6-v2 recommended for CPU)
- [ ] Build vector index alongside existing fact store
- [ ] Replace similarity scoring with cosine similarity
- [ ] Implement semantic conflict detection
- [ ] Build basic knowledge graph (nodes + edge types, no auto-clustering yet)

### Phase 3 — Extraction Upgrade (Weeks 11–14)
*Replace keyword triggers with LLM extraction*

- [ ] Build structured extraction prompt with JSON schema output
- [ ] Implement async extraction pipeline (runs after response is sent)
- [ ] Add working memory layer (in-RAM, session-scoped)
- [ ] Implement bidirectional extraction (user messages + assistant responses)
- [ ] Add confidence-aware fact formatting in context builder

### Phase 4 — Retrieval & Context (Weeks 15–18)
*Stop injecting everything, inject what matters*

- [ ] Build hybrid retrieval engine (semantic + recency + graph neighbors)
- [ ] Implement token-budget-aware context builder
- [ ] Build episodic session compression and episodic retrieval
- [ ] Implement cluster node auto-generation
- [ ] Add model-aware token budgeting

### Phase 5 — Intelligence Layer (Weeks 19–24)
*Make H.E.X. actively smart about its own memory*

- [ ] Build meta-memory self-knowledge index
- [ ] Implement proactive gap detection
- [ ] Add emotional/contextual state tracking in working memory
- [ ] Build memory health reports in dashboard
- [ ] Implement full audit logging
- [ ] Add encryption at rest

### Phase 6 — Polish & Scale (Weeks 25–30)
*Production hardening*

- [ ] Build enhanced MEMORY tab UI with graph visualization
- [ ] Implement export/import system
- [ ] Add user-configurable memory settings
- [ ] Performance optimization (HNSW index for large stores)
- [ ] Add memory diff view: "What H.E.X. learned this week"
- [ ] Comprehensive test coverage for extraction, conflict resolution, eviction

---

## 18. Performance Targets

| Operation | Current | Target |
|---|---|---|
| Fact extraction (async) | ~0ms (keyword) | <400ms (LLM call) |
| Similarity check (dedup) | <5ms | <20ms (embedding + HNSW) |
| Retrieval (full fact dump) | <10ms | <50ms (semantic search + rerank) |
| Context block construction | <10ms | <80ms (all layers) |
| Session compression | ~500ms | <1500ms (LLM call) |
| Total per-message memory overhead | <15ms | <150ms (async, non-blocking) |
| Fact store size (on disk) | ~50KB at 200 facts | ~2MB at 500 facts + vectors |
| Working memory overhead (RAM) | 0 | <5MB per active session |

---

## Closing Notes

This architecture treats H.E.X.'s memory as what it actually is: a **personal knowledge graph about a specific human being**. The goal is not to store everything — it is to build an accurate, evolving, richly connected model of who you are, what you care about, how you work, and what you've done, so that every interaction H.E.X. has with you is informed by genuine understanding rather than keyword recall.

The most impactful single upgrade is Phase 2 (embeddings + semantic conflict resolution). The most transformative overall is Phase 4 (hybrid retrieval) — because it's the change the user actually *feels* in every conversation.

---

*Document version: 1.0 — April 2026*  
*Architecture for H.E.X. by Softcurse*
