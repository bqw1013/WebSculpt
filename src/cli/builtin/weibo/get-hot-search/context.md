# Context

## Precipitation Background (Why This Command Exists)

This command was precipitated after a user asked "现在微博热榜是啥？" (What are the current Weibo hot search trends?). During exploration, no existing Weibo command was found in the library. A stable public API (`https://weibo.com/ajax/side/hotSearch`) was discovered and verified to return structured JSON without authentication.

## Value Assessment

- **Generality**: Applies to any scenario requiring current Weibo trending topics.
- **Reuse frequency**: High — hot search queries are common for news monitoring, social media analysis, and daily updates.
- **Time saved**: Eliminates repeated WebSearch + manual scraping; returns structured data in one call.

## Page Structure

- **API endpoint**: `GET https://weibo.com/ajax/side/hotSearch`
- **Request headers**: `User-Agent` (desktop Chrome), `Referer: https://weibo.com/`
- **Response format**: JSON with `ok: 1` and `data.realtime` array
- **Key fields**: `word`, `note`, `num`, `realpos`, `flag`, `icon_desc`, `label_name`, `word_scheme`

## Environment Dependencies

- No login or authentication required.
- Public API, but may impose rate limits or IP blocks under heavy load.
- Requires outbound HTTPS access to `weibo.com` and `s.weibo.com`.

## Failure Signals

- `ok !== 1` in response: service-side error or temporary restriction.
- HTTP status >= 400: network block, IP restriction, or API endpoint changed.
- `data.realtime` missing or empty: API structure drift.
- Missing `num` on some items: normal for certain entry types (ads, gov topics); handled gracefully.

## Repair Clues

- If the API endpoint becomes unavailable, try `https://weibo.com/ajax/statuses/hot_band` as an alternative Weibo hot search endpoint.
- If field names change, inspect the raw JSON response and map new fields to `word`, `num`, `realpos`, etc.
- If IP blocked, the command may need to switch to a browser runtime with cookie/visitor handling (significant change — consult user).
