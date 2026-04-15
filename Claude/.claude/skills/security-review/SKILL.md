# Skill: Security Review

Automatically triggered when files matching `*Controller.cs`, `*Repository.cs`, or `*Service.cs` are modified.

## What This Skill Does

Performs a focused security scan on changed backend files.

## Checklist

- [ ] No raw SQL strings — all queries use EF Core or parameterized commands
- [ ] User input is never interpolated into file paths
- [ ] API endpoints that modify data require authorization (`[Authorize]`)
- [ ] Sensitive fields (passwords, tokens) are never logged
- [ ] No secrets hardcoded in source — check for connection strings, API keys
- [ ] External URLs called by the app are validated against an allowlist
- [ ] File uploads validate extension and MIME type before saving

## Output Format

Report findings as:
**CRITICAL** — must fix before merge  
**WARNING** — should fix, explain risk  
**INFO** — suggestion for improvement
