# Context

## Precipitation Background (Why This Command Exists)

Stocktwits' editorial news feed (stocktwits.com/news-articles) delivers the latest staff-written market news, and — unlike most news aggregators — each article's FULL text is served in the list payload itself. A prior command-family planning document assumed a fixed 10 articles with no pagination; exploration (2026-08-20) discovered the site's own load-more JSON API `GET /api/tabArticles` which supports `limit` up to 50 and a `lastArticleSid` cursor, returning articles field-for-field identical to the SSR `__NEXT_DATA__`. The command uses that JSON API as the primary path and documents the SSR page as a same-shape fallback.

## Value Assessment

One request returns headline + full HTML body + summary + related symbols (symbolCodes + symbolsMetadata) + tags + source + author profile + timestamps — self-contained, no detail-page round trip. Anonymous and effectively unrate-limited (a 58-request burst in explore hit zero 429/403). Simple params (tab enum, limit, after_sid cursor). The output's symbolCodes/symbolsMetadata and author fields feed the other stocktwits get-* commands.

## Page Structure

- JSON API: `https://stocktwits.com/api/tabArticles?tab={tab}&limit={limit}&lastArticleSid={sid}` → `{"articles":[...],"status":"success"}`. Only a Chrome UA header is needed (no Referer/Accept).
- Article fields (snake_case in API, camelCase in output): sid, headline, summary, content (full HTML), created_at, updated_at, url_slug, canonical_url, category{id,name}, subcategory{id,name,parent_id}, primary_symbol_code, symbol_codes[], symbols_metadata{}, tags[]{id,tag_name}, source{id,source_name,url_domain}, featured_image, author{id,name,designation,description,profile_avatar,social_media_links}.
- SSR fallback (same-shape): `https://stocktwits.com/news-articles` → `<script id="__NEXT_DATA__">` → `props.pageProps.articles` (310KB HTML — heavier; use only if the JSON API drifts).
- Tab shapes: stocktwits = array w/ full content; crypto = array summary-only; trending/stocks = symbol-grouped object summary-only; watchlist = empty when anonymous.

## Environment Dependencies

- No login, no browser. Only a Chrome UA header is required.
- Polite pacing: random 200-700ms sleep before every request; 429/403/network errors retried with backoff up to 3 attempts.
- Measured effectively unrate-limited in explore (58-burst all 200; no rate-limit headers). Keep polite pacing anyway.

## Failure Signals

- `status !== "success"` or missing `articles` in JSON → API drift → `API_ERROR`.
- `tab=watchlist` anonymous → empty array → `partial=true` (documented; needs login).
- `stocktwits` tab suddenly returning articles WITHOUT `content` → possible soft degradation/drift (baseline always has content) — keep the data, note partial.
- HTTP 429/403 → `RATE_LIMITED` after 3 backoff retries.
- Network error / non-JSON body → `NETWORK_ERROR`.

## Repair Clues

- If `/api/tabArticles` drifts, fall back to the SSR page `https://stocktwits.com/news-articles` and parse `__NEXT_DATA__` → `props.pageProps.articles` (same article objects, tabId defaults to stocktwits).
- Article detail URL pattern (verified HTTP 200): `https://stocktwits.com/news-articles/{category.name}/{subcategory.name}/{url_slug}/{sid}`.
- If the tab enum changes, the site's route chunk `_next/static/chunks/pages/news-articles/[[...tabId]]-*.js` defines the tab array `["stocktwits","watchlist","trending","stocks","crypto"]`.
