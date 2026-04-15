# Project Roadmap: Claude Code Directory Structure

> A structured guide to setting up and scaling a Claude-powered development project using the `.claude/` configuration ecosystem.

---

## Phase 1 — Project Bootstrapping

**Goal:** Establish the foundational project layout and team-wide conventions.

### Tasks
- [ ] Create `CLAUDE.md` at the project root
  - Document tech stack (e.g., C#, Angular, Node.js)
  - Define build steps and onboarding instructions
  - List coding conventions and team agreements
- [ ] Create `CLAUDE.local.md` (gitignored)
  - Personal overrides per developer (local paths, credentials, preferences)
- [ ] Initialize `.claude/` directory

---

## Phase 2 — Configuration & Permissions

**Goal:** Lock down allowed/denied commands and set personal permission scopes.

### Tasks
- [ ] Create `.claude/settings.json`
  - Define allowed and denied bash commands for the team
- [ ] Create `.claude/settings.local.json` (gitignored)
  - Personal permission overrides per developer

---

## Phase 3 — Custom Commands

**Goal:** Automate repetitive workflows with slash-command shortcuts.

### Tasks
- [ ] Create `.claude/commands/` directory
- [ ] Write `review.md` → mapped to `/project:review`
  - Define the code review workflow Claude should follow
- [ ] Write `fix-issue.md` → mapped to `/project:fix-issue`
  - Define steps for diagnosing and patching bugs
- [ ] Write `deploy.md` → mapped to `/project:deploy`
  - Define the deployment checklist and execution steps

---

## Phase 4 — Style & Convention Rules

**Goal:** Ensure Claude follows project-specific coding standards consistently.

### Tasks
- [ ] Create `.claude/rules/` directory
- [ ] Write `code-style.md`
  - C# formatting rules, Angular component conventions, general style guide
- [ ] Write `testing.md`
  - xUnit conventions (backend), Jest conventions (frontend)
  - Coverage expectations, test naming patterns
- [ ] Write `api-conventions.md`
  - REST endpoint design standards
  - Contract definitions, pagination strategy, error response formats

---

## Phase 5 — Skills (Auto-triggered Behaviors)

**Goal:** Enable Claude to automatically apply specialized knowledge on certain file changes.

### Tasks
- [ ] Create `.claude/skills/` directory
- [ ] Build `security-review/SKILL.md`
  - Triggered automatically when backend files are modified
  - Defines what Claude should check: auth, injection risks, data exposure, etc.
- [ ] Build `deploy/SKILL.md`
  - Pre-deploy checklist Claude runs before any deployment action
  - Covers environment variables, migrations, smoke tests, rollback plan

---

## Phase 6 — Agents (Personas)

**Goal:** Define specialized Claude personas for targeted tasks.

### Tasks
- [ ] Create `.claude/agents/` directory
- [ ] Write `code-reviewer.md`
  - PR review persona: tone, checklist, what to look for, output format
- [ ] Write `security-auditor.md`
  - Security audit persona: threat modeling approach, severity classification, reporting style

---

## Milestones Summary

| Phase | Deliverable                          | Priority |
|-------|--------------------------------------|----------|
| 1     | `CLAUDE.md` + project layout         | 🔴 High  |
| 2     | `settings.json` + permissions        | 🔴 High  |
| 3     | Custom slash commands                | 🟠 Medium |
| 4     | Style & convention rules             | 🟠 Medium |
| 5     | Auto-triggered skills                | 🟡 Low   |
| 6     | Agent personas                       | 🟡 Low   |

---

## Notes

- Files ending in `.local` (e.g., `CLAUDE.local.md`, `settings.local.json`) must be added to `.gitignore` — they contain personal/environment-specific overrides not meant for the team repo.
- Skills in Phase 5 are triggered contextually by Claude based on file type or task — no manual invocation needed.
- Agents in Phase 6 can be invoked explicitly when a specific persona's expertise is needed (e.g., before merging a PR or before shipping a release).
