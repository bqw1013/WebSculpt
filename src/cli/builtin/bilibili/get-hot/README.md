# bilibili/get-hot

Fetch Bilibili real-time hot search trending topics.

## Description

This command retrieves the current hot search list from Bilibili via the official public API endpoint. It returns trending search keywords with their heat scores, display names, and metadata. No login or authentication is required.

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `limit` | No | `10` | Maximum number of hot search items to return. The API typically returns around 10 items, so this parameter acts as a filter on the output. |

## Return Value

Returns an object with the following structure:

```json
{
  "items": [
    {
      "rank": 1,
      "keyword": "search keyword",
      "show_name": "display name",
      "heat_score": 6052483,
      "heat_layer": "B",
      "word_type": 7,
      "icon": "https://..."
    }
  ],
  "count": 10,
  "source": "bilibili-hotword"
}
```

- `items`: Array of hot search entries.
- `count`: Number of items returned.
- `source`: Data source identifier.

Each item contains:
- `rank`: Position in the returned list (1-based).
- `keyword`: Raw search keyword.
- `show_name`: Display name shown on Bilibili (falls back to `keyword`).
- `heat_score`: Numeric heat value.
- `heat_layer`: Heat tier (e.g., "S", "A", "B").
- `word_type`: Internal category type identifier.
- `icon`: Icon/image URL for the entry.

## Usage

```bash
# Get default 10 hot search items
websculpt bilibili get-hot

# Get top 5 only
websculpt bilibili get-hot --limit 5
```

## Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_PARAM` | The `limit` parameter is not a positive integer. |
| `NETWORK_ERROR` | HTTP request failed (e.g., timeout, DNS error). |
| `API_ERROR` | Bilibili API returned a non-zero code. |
| `EMPTY_RESULT` | The API returned an empty list. |
