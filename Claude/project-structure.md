# Project Directory Structure

```
Claude
├── CLAUDE.md                        ← team instructions (tech stack, conventions, build steps)
├── CLAUDE.local.md                  ← personal overrides (gitignored)
└── .claude/
    ├── settings.json                ← allowed/denied bash commands
    ├── settings.local.json          ← personal permissions (gitignored)
    ├── commands/
    │   ├── review.md                ← /project:review
    │   ├── fix-issue.md             ← /project:fix-issue
    │   └── deploy.md                ← /project:deploy
    ├── rules/
    │   ├── code-style.md            ← C#, Angular, general style rules
    │   ├── testing.md               ← xUnit + Jest conventions
    │   └── api-conventions.md       ← REST, contracts, pagination, errors
    ├── skills/
    │   ├── security-review/SKILL.md ← auto-triggered on backend file changes
    │   └── deploy/SKILL.md          ← pre-deploy checklist
    └── agents/
        ├── code-reviewer.md         ← PR review persona
        └── security-auditor.md      ← security audit persona
```
