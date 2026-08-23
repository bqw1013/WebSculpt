# Evidence: huggingface/get-paper

This document records the research and validation evidence for the `huggingface/get-paper` command.

## Exploration Path

Exploration performed in a prior explore workspace (audit passed). Command library checked: no existing `huggingface/get-paper`; `huggingface/get-papers` is the list command only. Verified via Playwright CLI attach to the user's Chrome (explore session `<session>`).

Key verified facts:
- Paper page `https://huggingface.co/papers/{id}` is fully server-side rendered (SSR). On a fresh page load the page itself makes NO paper-data API calls (only `/api/event`, `/api/settings/metrics/live`, and a platform telemetry script POST). title/abstract/authors/upvotes/comments are all embedded in the SSR HTML.
- Internal API `https://huggingface.co/api/papers/{id}` works via page-internal fetch (200 JSON) and is the cleanest source for structured fields. It does NOT include the comment count.
- Comment count is only available from the SSR DOM: each comment is a `<div id="{Mongo ObjectId}" class="scroll-mt-4 ">` inside the section that contains `<h3 id="community">`. Counting `#community` section `div.scroll-mt-4` elements matches the rendered comment count (verified: 2 for paper 2608.05987, page-wide `scroll-mt-4` occurrence is also exactly 2).
- Nonexistent paper_id: API returns HTTP 404 with JSON `{"error":"Paper not found. ..."}`; navigating to the page redirects to `/papers/index?arxivId={id}` titled "Index missing paper". Both are reliable NOT_FOUND signals.

## Verified URLs

- `https://huggingface.co/papers/2608.05987` (paper detail, fully SSR; h1 = title; abstract in section; community comments under `<h3 id="community">`)
- `https://huggingface.co/api/papers/2608.05987` (page-internal fetch, 200 JSON)
- `https://huggingface.co/papers/9999.99999` (nonexistent → redirect to `/papers/index?arxivId=9999.99999`, "Index missing paper")
- `https://huggingface.co/api/papers/0000.00000` and `/api/papers/9999.99999` (404 JSON `{"error":"Paper not found. ..."}`)
- `https://arxiv.org/abs/2608.05987` (arXiv page, confirmed via the "View arXiv page" link href)

## Structural Evidence

`/api/papers/{id}` top-level keys (verified for 2608.05987):
`id`, `authors` (array of `{name, user?, status?}`), `publishedAt`, `submittedOnDailyAt`, `title`, `submittedOnDailyBy` (object `{fullname, user, name, ...}`), `summary` (the abstract), `upvotes`, `discussionId`, `githubRepo`, `githubRepoAddedBy`, `githubStars`, `organization` (object `{fullname, name, ...}`), `linkedModels`/`numTotalModels`, `linkedDatasets`/`numTotalDatasets`, `linkedSpaces`/`numTotalSpaces`.

Field mapping for the output contract:
- `id` = `j.id`
- `title` = `j.title`
- `url` = `https://huggingface.co/papers/{id}` (constructed)
- `abstract` = `j.summary`
- `authors` = `j.authors.map(a => a.name)` (array of names)
- `submitted_by` = `j.submittedOnDailyBy ? (j.submittedOnDailyBy.fullname || j.submittedOnDailyBy.user || j.submittedOnDailyBy.name) : null`
- `upvotes` = `j.upvotes`
- `published` = `j.publishedAt` (ISO string)
- `arxiv_url` = `https://arxiv.org/abs/{id}` (constructed)
- `comments_count` = SSR DOM count of `#community section div.scroll-mt-4` (the only field not in the API)

Real extraction sample for `2608.05987`: title "AgentOPSD: Recursive Self-Distillation for Agentic Reinforcement Learning", 13 authors, submitted_by "Zi-Han Wang", upvotes 84, comments_count 2, published "2026-08-06T00:00:00.000Z", arxiv_url "https://arxiv.org/abs/2608.05987". API also provides `githubRepo` = `https://github.com/ZethWang/AgentOPSD`, `githubStars` = 18, `organization` = "Tsinghua University", `discussionId`.

## Failure Signals

- Nonexistent paper_id: API 404 (`status === 404`) OR page redirect to `/papers/index` → throw `NOT_FOUND`.
- Drift: if h1 or `#community` heading is missing after load, or the API fetch fails unexpectedly, the page structure may have changed → `DRIFT_DETECTED`.
- Rate limiting: a platform telemetry script is present on the page. Rapid consecutive calls may trigger 429/403/CAPTCHA. Command must include random human-like pauses, mouse moves and scrolls and must be paced.
- `submitted_by` and `organization` can be null for papers not in a daily list.
- Command-line network (node https / curl) cannot connect to huggingface.co; only the browser (page-internal fetch) works.

## Capture Assessment

This command should be captured: it is the single-paper detail complement to the existing `huggingface/get-papers` (list) command, enabling a chain list→detail workflow. All extraction paths were verified with real data in the explore phase (API 200 JSON + SSR DOM comment count), error behavior (404/NOT_FOUND) was measured, and the runtime is browser (required because command-line network cannot reach huggingface.co).
