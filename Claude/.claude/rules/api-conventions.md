# API Conventions

## Endpoint Naming

- REST: `GET /api/listings`, `POST /api/listings`, `DELETE /api/listings/{id}`
- No verbs in URLs: use `/api/orders/{id}/cancel` not `/api/cancelOrder`

## Request / Response Models

Every endpoint must have dedicated contract models in `Domain.Contracts`:

```
YourProject.Domain.Contracts/
  Listings/
    GetListingsRequest.cs
    GetListingsResponse.cs
    CreateListingRequest.cs
    CreateListingResponse.cs
```

## Error Responses

Always return `ProblemDetails` on errors:

```json
{ "status": 404, "title": "Not Found", "detail": "Listing 42 does not exist" }
```

## Pagination

All list endpoints accept `?page=1&pageSize=20` and return:

```json
{ "items": [...], "total": 100, "page": 1, "pageSize": 20 }
```

## Response Caching

Add `[ResponseCache]` attribute to read-heavy GET endpoints.
