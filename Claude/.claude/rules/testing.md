# Testing Rules

## Backend (xUnit)

- One test class per handler or service
- Use `Arrange / Act / Assert` comment sections for clarity
- Mock external HTTP calls — never hit real APIs in unit tests
- Integration tests go in `*.IntegrationTests` project, use a test DB
- Test method naming: `MethodName_Scenario_ExpectedResult`

## Frontend (Jest + Angular Testing Library)

- Test component behavior, not implementation details
- Prefer `findByText`, `findByRole` over direct DOM queries
- Mock services with `{ provide: ServiceClass, useValue: mockObj }`
- Every new component needs at least one smoke test (renders without error)

## Coverage

- Aim for 80%+ on Application layer handlers
- 100% on pure utility/helper functions
- No coverage requirement on controllers (covered by integration tests)
