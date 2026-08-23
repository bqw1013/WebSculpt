# Evidence: huggingface/list-papers

This document records the research and validation evidence for the `huggingface/list-papers` command.

## Exploration Path

- Command library check: existing `huggingface/get-papers` covers the same list scenario but is renamed to `list-papers` for naming consistency (list- prefix for list semantics). `get-paper` (single paper detail) is the downstream command; `url`/`arxiv` fields in list output chain directly into it.
- Used Playwright CLI to attach to the user's Chrome (session `<session>`) and verified every path below on the live site.
- Full exploration trace in a prior explore workspace (assess passed, `capture eligible: yes`).

## Verified URLs

All URLs were actually visited in the attached user Chrome and used for extraction:

- `https://huggingface.co/papers` — server-side redirect to a period page (SSR). Redirect target is state-dependent (remembers last-viewed period), so the command must not rely on it; it clicks the period tab instead.
- `https://huggingface.co/papers/date/2026-08-07` — daily list, 30 cards, periodType `day`. Past dates render directly.
- `https://huggingface.co/papers/date/2026-08-10` — future/unpublished date clamps to latest published day (2026-08-07).
- `https://huggingface.co/papers/date/2026-06-01` — arbitrary past date works, 62 cards.
- `https://huggingface.co/papers/week/2026-W32` — weekly list, 105 cards, periodType `week`.
- `https://huggingface.co/papers/month/2026-08` — monthly list, 105 cards, periodType `month`.
- Browser same-origin fetch probes:
  - `/api/papers?date=2026-08-07`, `?week=2026-W32`, `?month=2026-08`, and no-param all return the same 50-item list (NOT period-filtered; unusable for this command).
  - `/api/papers/2608.05987` returns full single-paper JSON (id/authors/publishedAt/title/summary/upvotes/discussionId/githubRepo/githubStars/organization/...).
  - `/api/papers/date/2026-08-07` returns 404.

## Structural Evidence

- Period URLs: daily `/papers/date/{YYYY-MM-DD}`, weekly `/papers/week/{YYYY}-W{WW}` (ISO week), monthly `/papers/month/{YYYY-MM}`. All SSR.
- Period switch UI: three `<button>` elements labeled `Daily` / `Weekly` / `Monthly` in the page header. Clicking always navigates to the LATEST period of that type (verified: from 2026-06-01 clicking Weekly -> latest 2026-W32, Monthly -> 2026-08, Daily -> latest 2026-08-07). This is the deterministic entry — the command does NOT construct date URLs.
- Rich data source (stable, used by this command): SSR hydration JSON embedded in
  `<div class="SVELTE_HYDRATER contents" data-target="DailyPapers" data-props='{...escaped JSON...}'>`.
  Extract: `JSON.parse(document.querySelector('[data-target="DailyPapers"]').getAttribute('data-props'))`.
- Hydration JSON shape (verified sample):
  ```
  { authLight, canSubmit, dateString, dailyPapers: [...], prevDate, publisher, periodType, query, isTrending }
  periodType: "day" | "week" | "month"
  dailyPapers[i] = {
    paper: { id, authors[], publishedAt, submittedOnDailyAt, title, submittedOnDailyBy, summary,
             upvotes, discussionId, githubRepo?, githubRepoAddedBy?, githubStars?, organization?, projectPage? },
    title, summary, thumbnail, numComments, upvoted, submittedBy, organization, isAuthorParticipating
  }
  ```
- `paper.id` is the arXiv id -> arXiv URL is derived as `https://arxiv.org/abs/{id}`.
- `githubRepo` / `githubStars` are present only when the paper has a GitHub repo (nullable).
- `paper.organization.fullname` = institution; `paper.submittedOnDailyBy` / `item.submittedBy` = HF submitter; `item.numComments` = comment count.
- List DOM cards (fallback/visual) contain only title/url/upvotes(`label div.leading-none`)/submitted-by/institution chip/GitHub star count/comment count — NOT abstract/authors/published/github URL/arxiv. Old get-papers DOM selectors (article>p abstract, ul>li authors, a[href*=github.com]) are stale for the current layout; the hydration JSON is the reliable extraction path.
- Daily has 30 papers; weekly/monthly have 105. `limit` slices; for daily, actual cap is 30 (report actual count when limit exceeds available).

## Failure Signals

- `INVALID_PARAM`: `period` not in {daily, weekly, monthly}; `limit` not a number in [1,100].
- `EMPTY_RESULT`: `dailyPapers` array empty or missing.
- `DRIFT_DETECTED`: `[data-target="DailyPapers"]` hydration div or the expected period `<button>` not found.
- Period tab click is a SPA navigation: after clicking, must wait for the URL to match the expected pattern (`/papers/date/`, `/papers/week/`, `/papers/month/`) before parsing, otherwise stale data may be read.
- `goto /papers` redirect is state-dependent (persists last period); never treat its landing period as authoritative — always click the target period tab.
- Polite pacing: no 403/429/CAPTCHA observed during exploration. To stay modest with concurrent explores, the command inserts random scroll + random wait before operations.
- Requires Chrome/Edge with remote debugging; no login.

## Capture Assessment

This command should be captured. It turns a verified, reusable HF Papers trending-list path into a CLI command (`websculpt huggingface list-papers`), replacing the stale DOM-parsing `get-papers` with a stable SSR hydration-JSON extraction. It covers the daily/weekly/monthly trending-paper scenario, produces rich per-paper output (abstract/authors/published/upvotes/github/arxiv/organization/comments/submittedBy), and chains into the downstream `get-paper` detail command via the derived `url`/`arxiv` fields. Runtime is browser because command-line networking cannot reach huggingface.co; the browser path was fully validated during exploration.
