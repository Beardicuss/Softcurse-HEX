# Skill: Deploy

Triggered when the user runs `/project:deploy` or asks to deploy/release.

## Pre-Deploy Checks

1. All tests pass (`dotnet test`, `ng test --watch=false`)
2. No `appsettings.*.json` with placeholder values like `YOUR_KEY_HERE`
3. Migration pending check: `dotnet ef migrations list` — warn if unapplied
4. Frontend build succeeds with `--configuration production`
5. Git working tree is clean (no uncommitted changes)

## Deploy Steps

```bash
dotnet publish -c Release -o ./publish
# Copy to server, restart service
```

## Rollback

Keep the previous publish folder as `./publish.bak` for instant rollback.
