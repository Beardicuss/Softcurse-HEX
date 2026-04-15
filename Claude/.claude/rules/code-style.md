# Code Style Rules

## C# / .NET

- File-scoped namespaces: `namespace YourProject.Application.Commands;`
- Primary constructors preferred for services with DI
- `var` for local variables when type is obvious from the right-hand side
- Records for immutable DTOs and MediatR request/response types
- Async suffix on all async methods: `GetListingsAsync`, not `GetListings`
- No `public` fields — always properties
- `private readonly` for injected dependencies

## Angular / TypeScript

- `ChangeDetectionStrategy.OnPush` on every component
- Standalone components only — no NgModules
- `inject()` function preferred over constructor injection
- Signals for local state, services for shared state
- Template variables: `snake_case` for `#templateRef`, `camelCase` for everything else
- No inline styles — always use the component's `.scss` file

## General

- Max line length: 120 characters
- No commented-out dead code committed
- TODO comments must include a ticket number: `// TODO(#123): fix this`
