# /project:deploy

Prepare and validate a production deployment.

## Steps

1. Run `dotnet build -c Release` and confirm zero errors
2. Run `dotnet test` — abort if any test fails
3. Run `ng build --configuration production` for frontend
4. Check `appsettings.Production.json` for missing or placeholder values
5. Print a deployment checklist summary for the user to confirm before proceeding
