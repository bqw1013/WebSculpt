# Evidence: weibo/get-hot-search

This document records the research and validation evidence for the `weibo/get-hot-search` command.

## Exploration Path

1. Checked the WebSculpt command library — no existing weibo-related commands found.
2. Used WebSearch to locate Weibo hot search sources. Found two candidates:
   - `https://tophub.today/n/KqndgxeLl9` (aggregator) — content requires JS rendering, static fetch returned no data.
   - `https://m.weibo.cn/p/106003type=25&t=3&disable_hot=1&filter_type=realtimehot` — mobile page accessible but returns visitor redirect (302) when fetched via plain HTTP without cookie handling.
3. Explored Weibo's public JSON API and discovered `https://weibo.com/ajax/side/hotSearch`, which returns a clean JSON payload with full hot search data. No authentication or browser required.
4. Verified the API with a direct `fetch` call — returned HTTP 200 with complete `realtime` array containing titles, heat values, ranks, tags, and topic flags.

## Verified URLs

- `https://weibo.com/ajax/side/hotSearch` — Weibo public hot search API. Returns JSON with `ok: 1` and `data.realtime` array.

## Structural Evidence

The API response structure (validated on 2026-05-09):

```json
{
  "ok": 1,
  "data": {
    "realtime": [
      {
        "word": "车企锁电",
        "note": "车企锁电",
        "num": 1171866,
        "realpos": 1,
        "flag": 0,
        "icon_desc": "热",
        "label_name": "热",
        "topic_flag": 0,
        "word_scheme": "车企锁电"
      }
    ]
  }
}
```

Key fields:
- `word` / `note`: topic title (use `word` as primary, fallback to `note`)
- `num`: heat value as integer (may be missing for some items)
- `realpos`: actual display rank (1-based)
- `flag`: 0 = normal, 1 = new (新), 2 = hot (热)
- `icon_desc` / `label_name`: textual tag (e.g., "新", "热", "沸"; null if plain)
- `topic_flag`: 0 = plain word, 1 = hashtag topic
- `word_scheme`: search keyword including `#` for hashtag topics

URL construction:
- Search URL: `https://s.weibo.com/weibo?q=${encodeURIComponent(word_scheme || word || note)}`

## Failure Signals

- API returns `ok !== 1`: indicates service error or rate limit.
- HTTP non-200: network-level block or IP restriction.
- `data.realtime` is empty or missing: structural drift or API change.
- `num` field missing for some items: expected behavior for certain entries (e.g., ads or government topics), handled by returning `null`.

## Capture Assessment

This path should be captured because:
- It uses a stable, public Weibo API endpoint with no authentication required.
- The response is structured JSON, making parsing reliable and DOM-fragile.
- The command is highly reusable for any scenario requiring current Weibo trending topics.
- The API has been verified to return consistent field shapes across multiple requests.
