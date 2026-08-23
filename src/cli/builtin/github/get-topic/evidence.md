# Evidence: github/get-topic

This document records the research and validation evidence for the `github/get-topic` command.

## Exploration Path

New command (no existing command covers "topic detail + featured repositories"). Explore phase assess passed 2026-08-09, candidate `github/get-topic`. Command library checked via `websculpt command domains` / `websculpt command list github`: 10 existing github commands (get-repo, get-trending, list-repos, etc.), none overlapping; planned `github/list-topics` is the complementary directory (topic slug/url → get-topic consumes it).

Tools: `@playwright/cli` attach to user Chrome (CDP); `curl` for raw SSR verification.

Key finding: `https://github.com/topics/{topic}` is **pure SSR** — the raw HTML (verified by both curl and same-origin fetch) contains the topic header and up to 20 featured repo cards. The hydrated DOM has transient `INCLUDE-FRAGMENT` side-widget errors ("Uh oh! There was an error while loading.") under shared-browser load, but the main content is SSR and unaffected. Implementation uses same-origin `fetch()` of the raw HTML + `DOMParser`, the same stable pattern proven by `github/get-trending`.

## Verified URLs

- `https://github.com/topics/rust` — HTTP 200, pure SSR, 20 repo cards.
- `https://github.com/topics/machine-learning` — HTTP 200, 20 repo cards, identical structure.
- `https://github.com/topics/ztqtk-nonexistent-topic-xyz-2026` — HTTP 200 (NOT 404), 0 cards + SSR empty-state block (`div.f3.color-fg-muted.lh-condensed` "…topic hasn't been used on any public repositories, yet." + `a.btn.btn-primary` "Explore topics").
- `https://github.com/topics/Rust` (uppercase) — HTTP 200 after 302 redirect to lowercase `/topics/rust` (slug normalization).
- `https://github.com/topics/foo/bar` (malformed slug) — HTTP 404, body `Not Found`; browser title "Page not found · GitHub".

## Structural Evidence

Parse with `new DOMParser().parseFromString(html, 'text/html')` on raw SSR HTML fetched same-origin (`fetch(location.pathname + location.search, {credentials:'same-origin'})`).

Topic header:

| Field | Selector | Sample |
|---|---|---|
| display_name | `h1.h1` innerText | `Rust` |
| description | `.markdown-body.f5` innerText (collapse whitespace) | `Rust is a systems programming language created by Mozilla. …` |

Repo card container: `article.border.rounded.color-shadow-small.color-bg-subtle.tmp-my-4` (fixed 20 per page; scrolling does NOT add more). Ignore `INCLUDE-FRAGMENT` side-widget error markup (`.blankslate` "Uh oh!…") — not part of the repo list.

| Field | Selector | Sample |
|---|---|---|
| full_name | `a.Link.text-bold.wb-break-word[href]` (strip leading `/`) | `rust-lang/rust` |
| html_url | `"https://github.com/"` + full_name | `https://github.com/rust-lang/rust` |
| description | `p.color-fg-muted.mb-0` (may be null) | `Empowering everyone to build reliable and efficient software.` |
| language | `span[itemprop="programmingLanguage"]` | `Rust` |
| stars | `span[id^="repo-stars-counter-star"]` → `title` attribute (exact, e.g. `125,801`), strip non-digits → number; fallback `aria-label` (`125801 users starred this repository`); NOT the abbreviated visible text (`126k`) | `125801` |

Empty-state block (valid topic with no repos): `div.f3.color-fg-muted.lh-condensed`, text `The {topic} topic hasn't been used on any public repositories, yet.` (apostrophe may be `'`/`’`; match `/hasn.t been used on any public repositories/i`). Card count in this state = 0 → EMPTY_RESULT.

404 page: response status 404 and/or `document.title` contains `Page not found`, no `h1.h1`, no cards → NOT_FOUND.

Slug validation: `^[a-z0-9][a-z0-9-]*$` (lowercase letters, digits, hyphens). GitHub 302-normalizes uppercase to lowercase, but the contract validates strictly; uppercase input → INVALID_PARAM. `limit` = integer 1–100; the page holds at most 20 repos, so `limit` only truncates.

## Failure Signals

- **Invalid params** — empty/non-matching-slug `topic`, or `limit` not an integer in 1–100 → `INVALID_PARAM` (checked before any page access).
- **Not found** — HTTP 404 or title `Page not found · GitHub` (malformed path safety net; strict slug validation makes this rare) → `NOT_FOUND`.
- **Empty result** — HTTP 200 + 0 repo cards + empty-state block → `EMPTY_RESULT`.
- **Structure drift** — HTTP 200 + 0 repo cards but no empty-state block → `DRIFT_DETECTED` (GitHub changed the page).
- **Rate limit / bot check** — HTTP 429/403 or body/title matching `/whoa there|captcha|rate limit|access denied|unusual traffic/i` → `NETWORK_ERROR`.
- **Network failure** — `page.goto` or same-origin fetch rejects → `NETWORK_ERROR`.
- No CAPTCHA/429/403 observed during explore (5 curl requests + ~10 browser operations, spaced with random waits).

## Capture Assessment

Capture as `github/get-topic` (browser runtime). The topic page is pure SSR and stable, the same-origin fetch + DOMParser extraction is fast (single request, well under the 10s target), and the command is reusable/parameterizable (`topic` required, `limit` optional). It satisfies the stability/pacing requirements (random mouse gestures + random waits, no REST API, no quota). The output `{topic, display_name, description, url, count, repositories[]}` chains into downstream commands (list-repos / get-repo via `full_name`/`html_url`).
