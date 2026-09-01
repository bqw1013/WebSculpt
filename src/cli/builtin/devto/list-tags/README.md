# devto/list-tags

List DEV.to tags with summaries and display metadata.

## Description

Fetches the public DEV.to/Forem tag directory. When no `--query` is given, the command first calls the public Forem API and falls back to extracting the rendered `/tags` page if the API fails. When `--query` is given, the command uses the `/tags?q=<query>` page directly because the Forem API does not support server-side tag search.

## Parameters

- `limit` (number, optional, default `50`): Maximum number of tags to return. Range: 1–1000.
- `query` (string, optional): Filter tags by name substring. Example values: `{query}`, `{query-prefix}`.

## Return Value

```json
{
  "source": "api" | "browser",
  "tags": [
    {
      "name": "string",
      "short_summary": "string",
      "bg_color_hex": "string",
      "text_color_hex": "string (api only)",
      "id": "number (api only)",
      "posts_count": "number (browser only)"
    }
  ]
}
```

Fields that are not available for the chosen source are omitted from each tag object.

## Usage

```bash
# API-first path (no query)
websculpt devto list-tags
websculpt devto list-tags --limit 10

# Browser page search path
websculpt devto list-tags --query "{query}"
websculpt devto list-tags --query "{query-prefix}" --limit 5
```

## Common Error Codes

- `INVALID_PARAM`: `limit` is not an integer or is outside 1–1000.
- `EMPTY_RESULT`: No tags match the given `--query`.
- `RATE_LIMITED`: The API returned 429 and the browser fallback also failed.
- `NETWORK_ERROR`: The API or browser page could not be reached.
- `DRIFT_DETECTED`: The expected page structure changed and tags could not be extracted.
- `BROWSER_ATTACH_REQUIRED`: Browser remote debugging is not enabled.
