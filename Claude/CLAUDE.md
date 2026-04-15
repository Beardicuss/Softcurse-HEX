# Project Overview

Brief description of what this project does and its main purpose.

## Tech Stack

- **Backend**: .NET 8 / C# — Web API, MediatR, EF Core, PostgreSQL
- **Frontend**: Angular 18 — standalone components, OnPush change detection
- **Infrastructure**: Docker, Linux server, Nginx

## Architecture

```
src/
  YourProject.API/          # Controllers, middleware, startup
  YourProject.Application/  # MediatR commands/queries/handlers
  YourProject.Domain/       # Entities, contracts, interfaces
  YourProject.Infrastructure/ # EF Core, repositories, external services
frontend/
  src/app/
    core/                   # Services, guards, interceptors
    shared/                 # Reusable components
    features/               # Feature modules
```

## How to Build & Run

```bash
# Backend
cd src
dotnet restore
dotnet build
dotnet run --project YourProject.API

# Frontend
cd frontend
npm install
ng serve
```

## How to Run Tests

```bash
dotnet test
ng test
```

## Key Conventions Claude Must Follow

- Use MediatR for all business logic — no logic in controllers
- Repository pattern for all data access
- `Task.WhenAll` for parallel async calls, never sequential awaits in loops
- Angular: always `ChangeDetectionStrategy.OnPush`, standalone components only
- Never use `.Result` or `.Wait()` on async calls
- EF Core: if `.Any()` on a JSON column fails SQL translation, filter in memory after `ToListAsync()`
- Georgian Standard Time: use `GetGeorgianNow()` helper, never `DateTime.UtcNow` directly
- All new API endpoints need corresponding `HttpRequest` / `HttpResponse` contract models in `Domain.Contracts`

## Environment Variables

See `.env.example` for required variables. Never commit `.env` or `appsettings.local.json`.
