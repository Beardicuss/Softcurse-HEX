# /project:review

Review the current working changes for correctness, consistency, and style.

## Steps

1. Run `git diff` to see all uncommitted changes
2. Check that every new method has a corresponding unit test or integration test
3. Verify no `.Result` / `.Wait()` anti-patterns on async calls
4. Confirm all new endpoints have `HttpRequest` / `HttpResponse` contract models
5. Check Angular components use `ChangeDetectionStrategy.OnPush`
6. Flag any magic strings that should be constants or enums
7. Report findings grouped by: **Bugs**, **Style**, **Missing tests**, **Suggestions**
