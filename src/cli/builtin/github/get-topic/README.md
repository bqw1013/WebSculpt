# github/get-topic

## Description

Fetch a GitHub topic's popular repositories from `https://github.com/topics/<topic>` (e.g. `/topics/rust`). Returns the topic display name, description, canonical URL, and the featured repo cards (full_name, html_url, description, language, exact star count). Discover topics with `websculpt github list-topics`, then drill into one with this command.

Requires Chrome or Edge running with remote debugging enabled. No login required.

## Parameters

| Parameter | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `--topic` | string | yes | - | Topic slug — the last path segment of `https://github.com/topics/<topic>`. Examples: `rust`, `machine-learning`. Must match `^[a-z0-9][a-z0-9-]*$` (lowercase letters, digits, hyphens). Discover with `websculpt github list-topics`. |
| `--limit` | number | no | `20` | Max repositories to return (1-100). The topic page shows a fixed list of up to 20 featured repositories, so `limit` only truncates it (values above 20 still return at most 20). |

## Return Value

```json
{
  "topic": "rust",
  "display_name": "Rust",
  "description": "Rust is a systems programming language created by Mozilla. ...",
  "url": "https://github.com/topics/rust",
  "count": 20,
  "repositories": [
    {
      "full_name": "rust-lang/rust",
      "html_url": "https://github.com/rust-lang/rust",
      "description": "Empowering everyone to build reliable and efficient software.",
      "language": "Rust",
      "stars": 115374
    }
  ]
}
```

- `stars` is the exact count parsed from the page's `title` attribute (not the abbreviated `126k` display text).
- `count` = number of repositories actually returned (after `limit` truncation).

## Usage

```
websculpt github get-topic --topic rust
websculpt github get-topic --topic machine-learning --limit 5
```

## Common Error Codes

- `INVALID_PARAM` — `topic` empty or not a valid slug, or `limit` not an integer in 1-100.
- `NOT_FOUND` — the topic page is a GitHub 404 (malformed path safety net).
- `EMPTY_RESULT` — the topic is valid but no public repository uses it yet.
- `DRIFT_DETECTED` — the page loaded but no repo cards or empty-state block were found (GitHub structure changed).
- `NETWORK_ERROR` — page load or SSR fetch failed, or GitHub rate-limit/bot check detected.
- `BROWSER_ATTACH_REQUIRED` — browser is not connected (produced by the daemon).
