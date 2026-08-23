# Context

## Precipitation Background (Why This Command Exists)

Renamed from `huggingface/get-papers` to `list-papers` for get/list naming consistency. Provides the "HF trending papers" list scenario (daily 每日 / weekly 每周 / monthly 每月) with rich per-paper metadata, and chains into the `get-paper` detail command via `url` / `arxiv`. The old implementation parsed DOM cards with stale selectors (article>p abstract, ul>li authors, a[href*=github.com]); the current layout's compact cards no longer contain those fields, so the implementation switched to the SSR hydration JSON.

## Value Assessment

High reuse: HF Daily Papers is a frequently consulted trending source. One browser call returns up to 100 ranked papers with abstract/authors/published/upvotes/github/arxiv/organization/comments/submitter, avoiding N+1 detail-page fetches. Replaces a broken (stale-layout) command and standardizes the list- naming.

## Page Structure

- Entry: `https://huggingface.co/papers` (server redirect to a period page; redirect target is state-dependent and remembers the last-viewed period).
- Period URLs (SSR): daily `/papers/date/{YYYY-MM-DD}`, weekly `/papers/week/{YYYY}-W{WW}`, monthly `/papers/month/{YYYY-MM}`.
- Period tabs: `<button>` elements labeled `Daily` / `Weekly` / `Monthly`; clicking always navigates to the LATEST period of that type.
- Data: `<div class="SVELTE_HYDRATER contents" data-target="DailyPapers" data-props='{...}' data-props="...">`. Parse via `JSON.parse(document.querySelector('[data-target="DailyPapers"]').getAttribute('data-props'))`.
- Hydration JSON: `{ periodType: "day"|"week"|"month", dateString, dailyPapers: [...], prevDate, ... }`.
  `dailyPapers[i] = { paper: { id, authors[], publishedAt, title, summary, upvotes, discussionId, githubRepo?, githubStars?, organization?, ... }, numComments, submittedBy, organization, thumbnail, ... }`.
- `paper.id` is the arXiv id; arXiv URL = `https://arxiv.org/abs/{id}`.

## Environment Dependencies

- Browser runtime: needs Chrome/Edge with remote debugging (WebSculpt daemon connects over CDP; separate from explore-phase Playwright CLI attach). No login required (public data).
- Polite pacing (user hard requirement): random scroll + random mouse move + random wait (400-1200ms) before/between page operations; must not significantly slow the command (target <=10s: one navigation + at most one tab click + one JSON parse).
- Command-line networking (node/curl) cannot reach huggingface.co; the browser path is mandatory.

## Failure Signals

- `[data-target="DailyPapers"]` missing or `JSON.parse` failing → hydration div removed/renamed (page structure drift). Read via `readDailyPapers` which throws `EMPTY_RESULT`.
- Period tab button not found (`button` with text Daily/Weekly/Monthly absent) → throws `DRIFT_DETECTED`.
- After clicking a period tab, URL must match `/papers/date/`, `/papers/week/`, or `/papers/month/`; if it never matches, the SPA navigation failed (watch for timeouts).
- `goto /papers` landing period is not authoritative — always compare `landed.periodType` against the requested period and click the tab on mismatch.
- Rate limiting signals (403/429/CAPTCHA) were not observed during exploration; if they appear in future, reduce frequency and add longer random pauses.

## Repair Clues

- If the hydration div disappears, fall back to DOM card parsing (title `h3 a`, upvotes `label div.leading-none`, submitted-by badge, institution chip, GitHub star count) — but note the cards lack abstract/authors/published/github URL/arxiv.
- The single-paper API `/api/papers/{id}` returns full metadata (githubRepo/githubStars/organization/linkedModels) as a fallback for enriching individual papers, but is not period-filterable as a list.
- `/api/papers?date=&week=&month=` all return the same non-period-filtered list; do not use it as the list source.
