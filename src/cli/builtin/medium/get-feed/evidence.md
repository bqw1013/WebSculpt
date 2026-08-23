# Evidence: medium/get-feed

This document records the research and validation evidence for the `medium/get-feed` command.

## Exploration Path

- Command library check: `websculpt command list medium` returned `get-article`, `get-staff-picks`, `get-tag-trending`, `list-topics`, `search`. None covers the homepage feed → new command.
- Exploration tool: `@playwright/cli` 0.1.13, attached to the user's Chrome via CDP. Full trace with raw data samples was recorded (audit `status: passed`).
- Login state verified before exploring: `window.__APOLLO_STATE__` contains a `UserViewerEdge:` key whose userId equals viewerId and a matching `User:<id>` node. No "Sign in" links on the page.
- Data-source check: homepage `__APOLLO_STATE__.ROOT_QUERY` only contains `catalogById({"catalogId":"c7bc6e1ee00f"})` (Staff Picks) and `staffPicksFeed:{}` — the main feed is NOT in the embedded Apollo state, so DOM card extraction is the verified extraction surface.

## Verified URLs

- https://medium.com/?feed=for-you — personalized feed; card extraction, field selectors, and lazy loading verified here.
- https://medium.com/?feed=featured — Featured tab; verified it currently renders the empty state "No featured stories".
- https://medium.com/tag/artificial-intelligence — negative-case verification for the member-only detector (18 articles, only 5 carry the Member-only button).

## Structural Evidence

Feed cards: `article[data-testid="post-preview"]`, with `aria-label` = title, containing `h2` (title) and optionally `h3` (subtitle).

- Lazy loading (for-you, measured): scrolling 8 times grew the card count `[10,15,15,20,20,25,25,30,30]` — starts at 10, ~5 new cards per 1-2 scrolls (1200-2000px each). Deduplication key = canonical URL with `?source=...` query stripped.
- url: `<a>` wrapping/containing the `h2`; strip query string → canonical post URL, e.g. `https://medium.com/ai-advances/observability-for-the-agentic-ai-harness-07b322518206`.
- author: first `<a>` whose href matches `^/@[^/?]+/?(\?.*)?$` with non-empty text → name + username. Verified on both personal posts (byline "Fredrik Scheide · 4d ago") and publication posts (byline "In <pub> by <author> · <date>").
- publication: inside the byline container (author link's ancestor walked up ≤6 levels until it contains a date-like leaf), the other non-author `<a>` with non-empty text → name; slug = first path segment of its href (e.g. `/gitconnected`). `null` for personal posts (verified on 3 samples).
- publishedAt: leaf text inside the byline matching `^(\d+[smhdw] ago|Just now|(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(,\s*\d{4})?)$`. Display text only ("6d ago", "Feb 23"); cards expose NO ISO date and no `<time>` element.
- clapCount / responseCount / repostCount: find the `<svg>` whose `<desc>`/`<title>` text is exactly `A clap icon` / `A response icon` / `Repost icon`; walk up ≤5 ancestors and take the first span matching `^[\d.,]+[KM]?$`; parse K/M suffixes to integers. Extraction succeeded on all 30 scrolled cards.
- isMemberOnly: presence of `button[aria-label="Member-only story"]`. Negative case verified on the tag page (free stories lack the button).
- previewImageUrl: card images with `img.alt === title` come in 2 sizes; pick the one with the larger `resize:fill:<w>:<h>` width.
- basedOnTopic: hint row at card top "Because you follow <topic>" (a `div` whose first leaf text is "Because you follow" and which contains `a[href*="/tag/"]`) → topic name. Most cards have no hint → null.
- Featured tab empty state: `h2` with text "No featured stories" plus "Featured stories from the publications you follow will appear here." — i.e. the Featured tab shows featured stories from publications the user follows (not Medium's global editorial picks), and is empty when no followed publications have featured stories.

Verified sample output (for-you, 2026-08-06):

```json
{"title":"Observability for the Agentic Harness","subtitle":"OpenTelemetry logging, Evals & FinOps for AI Agents","url":"https://medium.com/ai-advances/observability-for-the-agentic-ai-harness-07b322518206","author":{"name":"Debmalya Biswas","username":"debmalyabiswas"},"publication":{"name":"AI Advances","slug":"ai-advances"},"publishedAt":"2d ago","clapCount":251,"responseCount":4,"repostCount":1,"previewImageUrl":"https://miro.medium.com/v2/resize:fill:160:107/1*niDQV6RdCOROiYLS23peOA.png","isMemberOnly":true,"basedOnTopic":null}
```

## Failure Signals

- Not logged in: Apollo state lacks a `UserViewerEdge:` key whose userId equals viewerId → command must throw `AUTH_REQUIRED`. (Positive case verified; the logged-out page itself was not inspected because logging out was not an option.)
- Featured empty state: `h2` "No featured stories" → success with `items: []` and `emptyReason`, NOT an error. Lazy-load behavior of a non-empty featured feed could not be verified (account had none) — the scroll loop is written to handle it generically.
- No CAPTCHA / 403 / 429 observed during exploration.
- Drift signals: `article[data-testid="post-preview"]` missing after load → `DRIFT_DETECTED`; svg `desc`/`title` labels ("A clap icon" etc.) are English-locale accessibility strings and could drift with localization — counts then degrade to 0 rather than failing the whole command.
- for-you feed is effectively unbounded; the command scrolls until the limit is reached or no growth over several consecutive scrolls (then `partial: true`).

## Capture Assessment

Capture as `medium/get-feed` (browser runtime). The path is fully verified end-to-end on the logged-in homepage: stable `data-testid` card selector, verified per-field extractors, measured lazy-loading behavior, and a verified empty-state contract for the featured tab. It fills a real gap — no existing command covers the homepage feed, and the For You feed is Medium's main content-discovery entry. Login is required and was confirmed present; the command re-checks it at runtime and fails fast with `AUTH_REQUIRED`.
