# /project:fix-issue

Fix a reported bug or failing test.

## Steps

1. Read the issue description or failing test output provided by the user
2. Locate the relevant files using `grep` or file tree
3. Understand the root cause before touching any code
4. Apply the minimal fix — do not refactor unrelated code
5. Run affected tests: `dotnet test --filter <TestClass>`
6. Summarize what was wrong and what was changed
