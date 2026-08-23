# Context

## Precipitation Background (Why This Command Exists)

`techcrunch/get-feed` answers "what was published most recently" but not "what is hot right now". The Most Popular module on the TechCrunch homepage is the only reader-popularity signal on the site. It is a small server-rendered sidebar block (about 5-10 recent popular articles) that exists only on `https://techcrunch.com/` — there is no standalone page and no API, so the only viable path is parsing the homepage HTML. Precipitated from the command-family plan §5 after the explore phase verified the homepage structure.

## Value Assessment

- Reuse frequency: moderate-high — "what's hot on TechCrunch" is a common monitoring ask.
- Generality: single data source, single parameter; simple and cheap (one HTTP request).
- It complements rather than duplicates `get-feed` (chronological) and `get-topic` (company/people tag streams). The author `profileUrl` returned by each card feeds directly into `techcrunch/get-author` for reporter tracking.

## Page Structure

Data source: `https://techcrunch.com/` (public, no login, no browser). WordPress block-template HTML, fully server-rendered.

Verified structure (2026-08-14, 7 items):

```
div.wp-block-group.wp-block-techcrunch-most-popular-posts        <- module container
  div#wp-block-techcrunch-most-popular-posts__heading
    h2#h-most-popular "Most Popular"
  div.wp-block-query
    ul.wp-block-post-template
      li.wp-block-post.post-<id>...
        div.wp-block-techcrunch-card
          div.loop-card
            div.loop-card__content
              h3.loop-card__title > p#speakable-summary > a.loop-card__title-link[href=article]
              div.loop-card__meta > ul.loop-card__author-list > li > a.loop-card__author[href=/author/<slug>/]
```

Key selectors:
- Container: class token `wp-block-techcrunch-most-popular-posts` (distinguish from `...__heading` / `...__icon` with an underscore suffix).
- Items: `li.wp-block-post` directly inside `ul.wp-block-post-template`.
- Title link: `a.loop-card__title-link`; Author link: `a.loop-card__author`.
- No date element anywhere in the card.

## Environment Dependencies

- No login, no browser, no API key. Node runtime; uses global `fetch` (undici). TechCrunch serves the homepage to plain HTTP clients. Verified: plain `fetch` returns HTTP 200 with the full homepage.
- Polite pacing: a randomized 200-700ms delay is applied before the single request. Because there is only one request per invocation, this does not noticeably slow the command down.
- The homepage can vary by region / consent state; if a consent wall or block page ever appears for plain HTML requests, the command's non-HTML guard will surface `DRIFT_DETECTED` and a maintainer should re-check whether a browser runtime or a different entry point is needed.

## Failure Signals

- HTTP 403/429 → `RATE_LIMITED`.
- HTTP 404 → `NOT_FOUND`; other non-2xx → `API_ERROR`.
- Small non-HTML body (no `<html` opener) → `DRIFT_DETECTED` (block/consent page).
- Module container absent → `DRIFT_DETECTED` (page structure changed — e.g. TechCrunch renames/relocates the module).
- Module present but zero `li.wp-block-post` → `EMPTY_RESULT`.
- `limit` not a digit or outside 1-20 → `INVALID_PARAM` (validated on the raw string before `parseInt`, so `"5abc"`/`"1.5"` are rejected rather than truncated).

## Repair Clues

- If the module container class changes, the single regex in `extractPopular` (`class="wp-block-group wp-block-techcrunch-most-popular-posts(?=\s|")`) is the first thing to update.
- If card markup changes, check the anchor classes `loop-card__title-link` / `loop-card__author` first (they have been stable across TechCrunch's recent redesigns).
- If a date element is ever added to the cards, extend the item parser to read `time[datetime]` and populate the `date` field.
- Backstop: the article URLs produced are WordPress post URLs; a maintainer could cross-check titles against the public REST API (`https://techcrunch.com/wp-json/wp/v2/posts?include=...`) to confirm drift.
