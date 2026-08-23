# Context

## Precipitation Background (Why This Command Exists)

The Hugging Face command family had a paper list command (`get-papers`, now `list-papers`) but no single-paper detail command. To inspect one paper's full metadata (title/abstract/authors/submitter/upvotes/comments/date/arXiv link) after listing, a `get-paper` command was needed. Precipitated in the `huggingface-get-paper` explore (trace audited passed) and confirmed by the user for capture.

## Value Assessment

Complements `list-papers` for a list→detail chain. HF paper pages are fully SSR and the internal API is stable, so extraction is reliable. High reuse: any paper from the daily/weekly/monthly lists or from a paper id in the wild can be passed directly.

## Page Structure

- Page: `https://huggingface.co/papers/{id}` — fully server-side rendered (SSR). On load the page makes NO paper-data API calls. h1 = title; abstract in a section; Community comments under `<h3 id="community">`.
- Internal API: `https://huggingface.co/api/papers/{id}` — 200 JSON with `id`, `title`, `summary` (abstract), `authors[]` (`name`), `submittedOnDailyBy` (`fullname`/`user`/`name`), `upvotes`, `publishedAt`, `discussionId`, `githubRepo`, `githubStars`, `organization` (`fullname`), `linkedModels/Datasets/Spaces`. Does NOT include comment count.
- Comment count: each comment card is `<div id="{Mongo ObjectId}" class="scroll-mt-4 ">` inside the section containing `<h3 id="community">`. Count = `#community` section `div.scroll-mt-4`. Verified: 2 comments ↔ count 2; page-wide `scroll-mt-4` occurrence is exactly the comment count too.

## Environment Dependencies

- Browser runtime: requires Chrome/Edge running with remote debugging enabled; daemon connects via CDP. No login required (public data).
- Command-line network (node https/curl) cannot reach huggingface.co; must use page-internal fetch.
- Polite pacing: page loads a platform telemetry script. Command includes random waits, a random mouse move and a random scroll before extraction. Keep pacing light so a call stays well under ~10s.

## Failure Signals

- Nonexistent paper: API returns HTTP 404 (`{"error":"Paper not found. ..."}`); page redirects to `/papers/index?arxivId={id}` titled "Index missing paper". Command throws `NOT_FOUND` on either signal.
- Structure drift: missing `h1`, missing `#community`, or unexpected API status → `DRIFT_DETECTED`.
- Rate limiting: 429/403/CAPTCHA or a platform challenge page → slow down, retry with longer delays; if persistent, the site may be throttling rapid calls.

## Repair Clues

- If the API shape changes, re-fetch `/api/papers/{id}` and re-map fields (abstract=`summary`, submitted_by=`submittedOnDailyBy.fullname`, published=`publishedAt`).
- If the comment count breaks, re-check the SSR DOM structure of the Community section (the `<h3 id="community">` anchor and the `div.scroll-mt-4` comment-card class); fall back to counting comment containers by a new stable selector.
- githubRepo/githubStars/organization/discussionId are available from the API for future output extensions.
