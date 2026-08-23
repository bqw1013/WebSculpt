# Evidence: stocktwits/list-news

This document records the research and validation evidence for the `stocktwits/list-news` command.

## Exploration Path

Explored on 2026-08-20. A prior command-family planning document claimed `/news-articles` SSR is fixed at 10 articles with no pagination; this exploration independently verified that claim and corrected it: the site's own load-more JSON API `GET /api/tabArticles` supports `limit` up to 50 and a `lastArticleSid` cursor for pagination, returning article objects field-for-field identical to the SSR `pageProps.articles`.

Library check: `websculpt command list stocktwits` showed no stocktwits commands at explore time; no conflicts with this command.

Tool contract consulted: node runtime contract. Runtime is `node` (plain HTTPS JSON API, no browser, no login).

## Verified URLs

- https://stocktwits.com/api/tabArticles?tab=stocktwits&limit=10 — JSON API, 10 articles with full content (85KB response)
- https://stocktwits.com/api/tabArticles?tab=stocktwits&limit=50 — JSON API, 50 articles in one call (432KB)
- https://stocktwits.com/api/tabArticles?tab=stocktwits&limit=10&lastArticleSid=cZYIjdLRJmj — pagination via lastArticleSid cursor
- https://stocktwits.com/api/tabArticles?tab=crypto&limit=10 — crypto tab, array of summary-only articles (no content field)
- https://stocktwits.com/api/tabArticles?tab=trending&limit=10 — trending tab, object grouped by symbol, summary-only
- https://stocktwits.com/api/tabArticles?tab=stocks&limit=10 — stocks tab, object grouped by symbol, summary-only
- https://stocktwits.com/api/tabArticles?tab=watchlist&limit=10 — anonymous empty array (requires login)
- https://stocktwits.com/news-articles — SSR fallback, `__NEXT_DATA__` -> `props.pageProps.articles`, tabId=stocktwits, 10 articles with full content (310KB HTML; heavier than JSON API)
- https://stocktwits.com/news-articles/markets — category page, 50 articles with full content
- https://stocktwits.com/news-articles/markets/equity/jp-morgan-recommends-investors-to-accumulate-skhy-stock-expects-sentiment-to-improve-gradually-after-sk-hynix-announces-28-7-b-buyback/cZYIoqBRJmv — article detail URL pattern, HTTP 200

## Structural Evidence

Endpoint: `GET https://stocktwits.com/api/tabArticles?tab={tab}&limit={limit}&lastArticleSid={sid}` returns `{"articles":[...],"status":"success"}`. Works with only a Chrome UA header; no Referer/Accept required.

Article object fields (26 verified on article[0], sid `cZYIoqBRJmv`): `sid`, `type`, `category{id,name}`, `subcategory{id,name,parent_id}`, `headline`, `summary`, `content` (full HTML body), `created_at`, `updated_at`, `url_slug`, `canonical_url`, `primary_symbol_code`, `symbol_codes[]`, `symbols_metadata{}`, `tags[]{id,tag_name}`, `source{id,source_name,url_domain}`, `meta_title`, `meta_description`, `meta_keywords`, `featured_image`, `featured_image_attributes{alt_text,caption}`, `image_url`, `is_amp`, `is_indexed`, `rss_syndicated`, `hero_article`, `author` (full profile: `id,name,designation,description,profile_avatar,country,email,social_media_links{twitter,facebook,website}`).

Content volume: full-text content present for tab=stocktwits, 3112-6087 chars of HTML per article (e.g. article[0]=5063). Summary is a separate 1-3 sentence field. No second request needed for full text.

Tab shape differences (platform truth, not rate-limit degradation):
- `tab=stocktwits` (default): `articles` is an ARRAY with full `content`.
- `tab=crypto`: array but articles have NO `content` field (summary-only). Confirmed identical on SSR page.
- `tab=trending` / `tab=stocks`: `articles` is an OBJECT grouped by symbol `{symbol: [articles]}`, articles are summary-only. Confirmed identical on SSR page.
- `tab=watchlist`: empty array when anonymous (requires login).
- invalid `tab=foo`: HTTP 200 `{"articles":[],"status":"success"}` (empty, no error).

Pagination: `lastArticleSid` = the `sid` of the last article of the previous page. Verified 3 consecutive pages of 10 with no overlap. `status` is always `"success"`. `limit=50` verified to return 50.

Rate-limit findings (recorded per item):
1. No-sleep burst of 58 consecutive requests (20+8+30 across mixed tabs/limits) -> all HTTP 200, zero rate limiting observed, no threshold point hit. Cumulative ~75+ requests that day, 0 x 4xx/429.
2. No explicit 429/403/captcha.
3. No soft degradation: byte sizes identical to first response (stocktwits limit=10 always 84876B), full content present in every response. crypto/trending/stocks missing content is stable, reproducible, SSR-consistent platform behavior.
4. No `rate|limit|retry|remaining|ratelimit` headers in any response.
5. Conclusion: Stocktwits anonymous access is effectively unrate-limited in practice. Implementation still uses polite 200-700ms random sleep + 429 backoff fallback per family convention.

## Failure Signals

- `status !== "success"` in JSON response: unexpected API shape (drift) -> `API_ERROR`.
- Empty `articles` array:
  - `tab=watchlist` anonymously -> expected empty (needs login); return partial=true with the empty array.
  - invalid tab -> API returns empty without error; treat as `INVALID_PARAM` guidance (document valid enum) but still surface the empty result.
  - valid tab with genuine end-of-cursor -> partial=true (fewer than requested).
- HTTP 429/403: transient rate limiting -> backoff retry (up to 3 attempts, increasing delay).
- Network errors / connection reset / non-JSON body: `NETWORK_ERROR`.
- `articles` shape differs from expected per tab (e.g. stocktwits tab suddenly returns object or strips content): structure drift; return the raw structure as-is rather than forcing a schema, and mark in README.
- Rate-limit soft degradation: if a previously full-content tab (stocktwits) returns articles missing `content`, it is a possible degradation signal (differs from verified baseline) — surface partial=true but keep the data.

## Capture Assessment

Capture this command. The editorial news feed with full text is self-contained value: one request delivers headline, full HTML body, summary, related symbols (symbol_codes + symbols_metadata), tags, source, author profile, and timestamps — no follow-up detail request needed. The JSON API is anonymous, plain HTTPS, and effectively unrate-limited (58-burst verified). Parameters are simple (tab enum, limit, after_sid cursor). The `stocktwits` tab (default) is the strong core; the other tabs are documented as returning their native structure (summary-only arrays, symbol-grouped objects, empty watchlist) so callers are not misled. Runtime node is correct: no browser, no login.
