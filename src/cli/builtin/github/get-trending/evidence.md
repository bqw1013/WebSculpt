# Evidence: github/get-trending

This document records the research and validation evidence for the `github/get-trending` command.

## Exploration Path

This command is a **redo** of the existing `github/get-trending` (node runtime, GitHub Search API approximation with 10 req/min anonymous rate limit). Replaced with a browser-runtime command that reads the real `github.com/trending` ranked list. Explore phase assess passed 2026-08-09, candidate `github/get-trending`.

Tools: `@playwright/cli` attach to user Chrome (CDP); all verification used the browser.

Key finding: the rendered DOM of `/trending` is **broken by React hydration** (card titles get replaced with a hidden "Sorry, something went wrong." error-boundary fallback). The raw SSR HTML obtained via **same-origin `fetch()`** is complete and stable. Implementation MUST use `page.evaluate` → `fetch(location.pathname + location.search, {credentials:'same-origin'})` → `DOMParser`, never the hydrated DOM.

## Verified URLs

- `https://github.com/trending` — daily (default) first-party test: 12 cards; card structure/selectors and `stars today` label verified.
- `https://github.com/trending?since=weekly` — weekly: 16 cards, title `...this week`, label `stars this week`.
- `https://github.com/trending?since=monthly` — monthly: 24 cards, title `...this month`, label `stars this month`.
- `https://github.com/trending/python` — language filter: 19 Python cards.
- `https://github.com/trending/python?since=weekly` — language + since combined: 17 Python cards.
- `https://github.com/trending/c++` — special slug: 18 C++ cards; URL path `/trending/c++` works directly.
- `https://github.com/trending/not-a-real-language-xyz123` — invalid language: HTTP 200, title reverts to no-language, 0 cards → EMPTY_RESULT signal.

## Structural Evidence

Raw SSR HTML (same-origin fetch) — the only reliable data source (hydrated DOM breaks). Parse with `new DOMParser().parseFromString(html, 'text/html')`.

Card container: `article.Box-row`. Each card also contains hidden error-boundary fallback markup (e.g. `h2.f5.mt-2` text `Sorry, something went wrong.`, `p.color-fg-muted.my-2.mb-2.ws-normal` text `There was an error...`, `p.blankslate-description`) — extraction MUST use the precise selectors below and ignore fallback elements.

| Field | Selector | Sample |
|---|---|---|
| full_name | `h2 a` innerText (collapse whitespace, `owner / repo`) | `PrimeIntellect-ai / prime-agent` |
| html_url | `"https://github.com"` + `h2 a[href]` | `https://github.com/PrimeIntellect-ai/prime-agent` |
| description | `p.col-9` (class `col-9 color-fg-muted my-1 tmp-pr-4`; may be null) | `A self-improving RLM agent...` |
| language | `span[itemprop="programmingLanguage"]` | `TypeScript` |
| stars (total) | `a[href*="/stargazers"]` innerText, strip non-digits | `9,460` → 9460 |
| forks | `a[href*="/forks"]` innerText, strip non-digits | `914` |
| stars_gained | inside `div.f6`, first span matching `/stars?\s+(today|this week|this month)/i`, strip non-digits | `2,483 stars today` → 2483 |
| builders | `a[data-hovercard-type="user"]` href (strip leading `/`) | `["kevinjosethomas","snimu",...]` |

Param → URL mapping (verified):
- `since`: `?since=daily|weekly|monthly`; default daily equals no param. Period label on gain stars changes (`stars today` / `stars this week` / `stars this month`).
- `language`: path segment `/trending/{language}` (URL-encoded), e.g. `/trending/python`, `/trending/c++`. Combined with since: `/trending/python?since=weekly`.
- Page count is NOT fixed (12 daily / 16 weekly / 24 monthly / 19 python / 17 python-weekly / 18 c++); max observed 24. `limit` truncates; `available` reflects the true page count.

## Failure Signals

- **Invalid language** → HTTP 200, title without language name, `article.Box-row` count = 0 → `EMPTY_RESULT`.
- **Rate limit / bot check** → detect HTTP 429/403 or body matching `/whoa there|captcha|rate limit|access denied|unusual traffic/i` → `NETWORK_ERROR`.
- **Hydration break** is NOT a failure signal for this command (we never read the hydrated DOM).
- **Network failure** (page.goto or fetch rejects) → `NETWORK_ERROR`.
- **Bad params** (since not in daily/weekly/monthly; limit not integer 1-25) → `INVALID_PARAM`.
- No CAPTCHA/429/403 observed during ~10 spaced same-origin fetches on 2026-08-09.

## Capture Assessment

Capture as `github/get-trending` (browser runtime), overwriting the existing node runtime version via `capture finalize --force`. The real ranked list from `github.com/trending` is accurate, free of API rate limits, and the same-origin SSR fetch is stable and fast (single request, ~2s). Reusable, parameterizable (since/language/limit), and satisfies the stability/pacing requirements.
