# medium/get-feed

Fetch the Medium homepage feed — the story cards from the **For you** or **Featured** tab.

## Description

Reads `https://medium.com/?feed=<feed>` in the attached browser (which carries your logged-in Medium session) and returns structured story cards: title, subtitle, canonical URL, author, publication, publish-date text, clap/response/repost counts, preview image, member-only flag, and the "Because you follow" topic hint when present.

The feed lazy-loads on scroll; the command scrolls with small randomized delays, mouse jiggles and smooth scrolls (polite pacing) until `--limit` cards are collected or the feed stops growing.

**Login is required.** The For You feed is personalized and does not exist in a meaningful form without a logged-in session; the command verifies the login state from the page's Apollo state and fails fast with `AUTH_REQUIRED` when logged out.

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--feed` | no | `for-you` | `for-you` = personalized recommendations. `featured` = **featured stories from the publications you follow** (Medium's current Featured tab semantics, not a global editorial selection). When there are none, the command succeeds with an empty list and an `emptyReason` message. Other values → `INVALID_PARAM`. |
| `--limit` | no | `20` | Max story cards, 1-100. Out-of-range or non-numeric values → `INVALID_PARAM` before any page access. |

## Return Value

```json
{
  "feed": "for-you",
  "count": 2,
  "items": [
    {
      "title": "Observability for the Agentic Harness",
      "subtitle": "OpenTelemetry logging, Evals & FinOps for AI Agents",
      "url": "https://medium.com/ai-advances/observability-for-the-agentic-ai-harness-07b322518206",
      "author": { "name": "Debmalya Biswas", "username": "debmalyabiswas" },
      "publication": { "name": "AI Advances", "slug": "ai-advances" },
      "publishedAt": "2d ago",
      "clapCount": 251,
      "responseCount": 4,
      "repostCount": 1,
      "previewImageUrl": "https://miro.medium.com/v2/resize:fill:160:107/1*niDQV6RdCOROiYLS23peOA.png",
      "isMemberOnly": true,
      "basedOnTopic": null
    }
  ]
}
```

Field notes:

- `url` is canonicalized (tracking query stripped) — pass it straight to `medium/get-article --url`.
- `author` is `null` in the unlikely case the byline is missing; `publication` is `null` for personal (non-publication) stories.
- `publishedAt` is the card's **display text** (`"2d ago"`, `"Feb 23"`); Medium cards expose no ISO timestamp.
- `clapCount` / `responseCount` / `repostCount` are integers (K/M suffixes resolved). They degrade to `0` if Medium changes its icon accessibility labels.
- `basedOnTopic` is the topic name from the "Because you follow \<topic\>" hint row; most cards have none (`null`).
- `partial: true` is present when the feed stopped growing before `--limit` was reached.
- Empty featured feed returns `{ "feed": "featured", "items": [], "count": 0, "emptyReason": "..." }` — a success, not an error.

## Usage

```bash
# Personalized For You feed, 20 cards (default)
websculpt medium get-feed

# Featured stories from publications you follow
websculpt medium get-feed --feed featured

# Load more cards via scrolling
websculpt medium get-feed --feed for-you --limit 50
```

## Common Error Codes

| Code | Meaning |
|---|---|
| `INVALID_PARAM` | `feed` not in `for-you \| featured`, or `limit` not an integer in 1-100. Raised before any page access. |
| `AUTH_REQUIRED` | No logged-in Medium session in the attached browser. Sign in and retry. |
| `PAGE_LOAD_FAILED` | Apollo state did not hydrate within timeout; login state could not be confirmed. |
| `DRIFT_DETECTED` | Neither feed cards nor the featured empty state appeared — page structure likely changed. |
| `BROWSER_ATTACH_REQUIRED` | (infrastructure) Chrome/Edge with remote debugging is not available. |
