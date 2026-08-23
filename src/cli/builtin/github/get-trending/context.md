# Context

## Precipitation Background (Why This Command Exists)

Redo of the existing `github/get-trending`. The old version used the GitHub Search API (`pushed>` time filter + stars sort) to **approximate** the trending ranking — data was inaccurate and the anonymous Search API rate limit (10 req/min) triggered often. This command reads the real ranked list from `github.com/trending`, which is not subject to API quotas.

## Value Assessment

High reuse: "what's trending on GitHub today/week/month, optionally by language" is a frequent need. Browser page access avoids API rate limits, and the single same-origin SSR fetch is fast and stable. Output feeds downstream commands (get-repo, list-issues, etc.) via `full_name` / `html_url`.

## Page Structure

- URL: `https://github.com/trending` (+ `?since=daily|weekly|monthly`, `/trending/{language}` path).
- **Critical**: the hydrated DOM of `/trending` is broken by a React error boundary — card `<h2>` titles get replaced by a hidden `Sorry, something went wrong.` fallback. **Never read the rendered DOM.**
- Data source: same-origin `fetch(location.pathname + location.search, {credentials:'same-origin'})` inside `page.evaluate`, parsed with `DOMParser`.
- Card container: `article.Box-row`. Precise selectors (see `evidence.md`):
  - full_name `h2 a`, description `p.col-9`, language `span[itemprop="programmingLanguage"]`,
  - total stars `a[href*="/stargazers"]`, forks `a[href*="/forks"]`,
  - gained stars: inside `div.f6`, span matching `/stars?\s+(today|this week|this month)/i`,
  - builders `a[data-hovercard-type="user"]`.
- Page count varies by period/language: daily=12, weekly=16, monthly=24, python=19, python+weekly=17, c++=18 (max observed 24). `limit` truncates; `available` reports the true count.

## Environment Dependencies

- Browser runtime (attach user Chrome/Edge via remote debugging). No login required.
- Polite pacing policy: random mouse move / wheel / wait built into the command; single call targets ≤10s (one page fetch).
- The daemon's CDP connection is independent of the explore-stage `@playwright/cli` session. First connect may show a Chrome "allow remote debugging" system dialog; if `BROWSER_ATTACH_REQUIRED` appears, confirm remote debugging is on and retry.
- github.com is sensitive to request bursts: keep calls spaced; observe 429/403/CAPTCHA signals and back off.

## Failure Signals

- 0 `article.Box-row` → `EMPTY_RESULT` (e.g. invalid language).
- HTTP 429/403 or body matching `/whoa there|captcha|rate limit|access denied|unusual traffic/i` → `NETWORK_ERROR` (rate-limit/bot check).
- `page.goto` or the in-page fetch rejects → `NETWORK_ERROR`.
- If GitHub changes card markup and selectors stop matching, `available` drops to 0 and `EMPTY_RESULT` fires — inspect whether it is a markup drift or a genuinely empty list.

## Repair Clues

- Re-verify the exact card selectors in the raw SSR HTML (the hydrated DOM is unreliable — always inspect via same-origin fetch).
- Fallback: the per-repo pages (`/owner/repo`) also expose the same star/description data via their own SSR embeddedData if the trending page structure changes drastically.
- Check `https://github.com/trending` periodically; GitHub may A/B test markup.
