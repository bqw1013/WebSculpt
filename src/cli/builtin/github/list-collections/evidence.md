# Evidence: github/list-collections

This document records the research and validation evidence for the `github/list-collections` command.

## Exploration Path

- Command library check (`websculpt command list github`): `github/list-collections` does not exist; siblings in the same planned batch (`github/list-topics`) are also not installed. No name conflict.
- Explored with curl + Playwright CLI (browser attach); the explore trace passed assess and the user confirmed the contract.
- Browser automation: used an independent Playwright session with its own tab, verified tab ownership by URL/title, and cleaned up (tab-close + detach) afterwards.
- Capture runtime contract: browser runtime contract read before implementing.

## Verified URLs

- `https://github.com/collections` — pure SSR, HTTP 200 (168,241 bytes via curl), single fixed page with no pagination. Used as the sole data source for extraction.

## Structural Evidence

- Page layout (verified in raw SSR HTML and live browser DOM):
  - Hero: `h1` "Collections" + tagline.
  - **Featured spotlight** (top): 3 cards, selector `a.exploregrid-item`, each has cover `<img>` (or `#` placeholder div) + title `<p.f3>` + description `<p.f5>`. This section **rotates / is session-dependent** (anonymous curl: learn-to-code/game-engines/made-in-brazil; browser session: learn-to-code/pixel-art-tools/game-engines) and includes collections absent from the A–Z index (game-engines, made-in-brazil, pixel-art-tools). **Excluded from extraction for reproducibility.**
  - **A–Z index list**: 20 cards, selector `article.d-flex.border-bottom`. Verified identical between anonymous curl and logged-in browser (same 20 slugs/titles/descriptions). This is the stable canonical list.
- Card field selectors (A–Z index cards), validated in live browser DOM:
  - `title`: `h2.h3 a` → `innerText.trim()`
  - `url`: `h2.h3 a` → `getAttribute('href')` (relative `/collections/<slug>`) → prefix `https://github.com`
  - `description`: `.col-10` clone → remove `h2` → `innerText.replace(/\s+/g, ' ').trim()` (description is a bare text node right after the `<h2>`, no wrapping class)
- Counts: `a.exploregrid-item` = 3, `article.d-flex.border-bottom` = 20, total `/collections/*` link occurrences = 23, unique slugs = 22 (`learn-to-code` appears in both featured and index).
- Full 20-entry extraction recorded inline in the explore trace.
- Limit semantics: page always exposes 20 index cards, so `available` is always 20; `limit` (1-100, default 20) only truncates; `partial = limit < 20`.

## Failure Signals

- Rate-limit awareness: page may return HTTP 429/403 or render a CAPTCHA / "unusual traffic" page. Detect via page title/body keywords (`whoa there|captcha|rate limit|access denied|unusual traffic`) and treat as `NETWORK_ERROR`. No bot signals observed during explore (1 curl + ~6 browser ops, random 200-700ms waits).
- Empty result: if `article.d-flex.border-bottom` count is 0, structure likely changed or an error page loaded → `EMPTY_RESULT`/`DRIFT_DETECTED`.
- Drift: if the selector set changes (e.g., `h2.h3 a` missing), fall back to `DRIFT_DETECTED`.
- `BROWSER_ATTACH_REQUIRED`: raised by the runner when Chrome/Edge with remote debugging is not connected.

## Capture Assessment

This command should be captured. It turns a verified, stable extraction path (SSR `github.com/collections` A–Z index, 20 fixed cards) into a reusable `browser`-runtime command matching the established GitHub command family (same error codes and `{source, count, available, partial, ...}` return-shape conventions as `get-trending`). It requires no login, is not subject to GitHub REST API quotas, and its single-page extraction is fast and reproducible. The rotating featured spotlight is deliberately excluded to keep output stable.
