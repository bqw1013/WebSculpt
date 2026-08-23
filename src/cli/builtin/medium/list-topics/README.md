# medium/list-topics

List Medium topics from the official directory at https://medium.com/explore-topics.

## Description

This command returns Medium topics (Medium UI calls them "topics"; their URLs live under `/tag/<slug>`). It supports two modes:

- **Directory mode**: without `--query`, returns all topics grouped by top-level category (Life, Work, Technology, etc.).
- **Search mode**: with `--query`, uses the page's "Search all topics" autocomplete to find topics by name.

Each topic includes `name`, `slug`, and `url`, which can be passed to `medium/get-topic-trending` or `medium/get-topic-info`.

## Parameters

- `--query` (string, optional): Topic name to search for via autocomplete. Example: `artificial` matches `Artificial Intelligence`.
- `--limit` (number, optional, 1-500): Maximum number of topics to return. In directory mode the default is all topics (~497). In query mode the default is 20.

## Return Value

**Directory mode** (no `--query`):

```json
{
  "count": 497,
  "categories": [
    {
      "category": "Technology",
      "slug": "technology",
      "topics": [
        { "name": "Artificial Intelligence", "slug": "artificial-intelligence", "url": "https://medium.com/tag/artificial-intelligence" },
        { "name": "ChatGPT", "slug": "chatgpt", "url": "https://medium.com/tag/chatgpt" }
      ]
    }
  ]
}
```

**Search mode** (with `--query`):

```json
{
  "query": "artificial",
  "count": 3,
  "topics": [
    { "name": "Artificial Intelligence", "slug": "artificial-intelligence", "url": "https://medium.com/tag/artificial-intelligence" },
    { "name": "Inteligencia Artificial", "slug": "inteligencia-artificial", "url": "https://medium.com/tag/inteligencia-artificial" },
    { "name": "Artificalintelligence", "slug": "artificalintelligence", "url": "https://medium.com/tag/artificalintelligence" }
  ]
}
```

## Usage

```bash
# Full categorized directory
websculpt medium list-topics

# Limit directory results to first 10 topics
websculpt medium list-topics --limit 10

# Autocomplete search
websculpt medium list-topics --query artificial

# Search with custom limit
websculpt medium list-topics --query programming --limit 2
```

## Common Error Codes

- `INVALID_PARAM`: `limit` is not a number or outside 1-500.
- `DRIFT_DETECTED`: The page structure or Apollo state changed and the expected data could not be found.
- `BROWSER_ATTACH_REQUIRED`: Chrome/Edge remote debugging is not available.
