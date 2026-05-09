# Evidence: bilibili/get-hot

This document records the research and validation evidence for the `bilibili/get-hot` command.

## Exploration Path

1. Checked the WebSculpt command library via `websculpt command list`. No existing bilibili commands were found.
2. Searched the web for "bilibili hot search API" and found references to the official hotword endpoint.
3. Verified the endpoint using `curl.exe` and Python's `urllib.request` against the live API.
4. The API returned valid JSON with a complete hot search list, confirming the path is stable and requires no authentication.

## Verified URLs

- `https://s.search.bilibili.com/main/hotword` — Official Bilibili hot search API. Returns JSON with a `list` array containing trending search terms, heat scores, and metadata. No authentication required.

## Structural Evidence

The API returns a JSON object with the following structure:

```json
{
  "code": 0,
  "exp_str": "_",
  "list": [
    {
      "hot_id": 249305,
      "keyword": "成都AG超玩会 上海EDG.M",
      "show_name": "成都AG超玩会 vs 上海EDG.M 挑杯",
      "score": 0.0,
      "word_type": 7,
      "goto_type": 0,
      "goto_value": "",
      "icon": "https://i0.hdslb.com/...",
      "live_id": [21144080],
      "heat_layer": "B",
      "pos": 1,
      "id": 1,
      "resource_id": 21144080,
      "heat_score": 6052483,
      "stat_datas": {
        "is_commercial": "0",
        "stime": "1778324400",
        "cny_flag": "0",
        "etime": "1778385600"
      }
    }
  ]
}
```

Key fields extracted:
- `list` (array): Contains all hot search entries. The API typically returns ~10 items.
- `keyword` (string): Raw search keyword.
- `show_name` (string): Display name shown on the platform; falls back to `keyword` if absent.
- `heat_score` (number): Numeric heat value used for ranking.
- `heat_layer` (string): Heat tier, e.g., "S", "A", "B".
- `word_type` (number): Category/type identifier.
- `icon` (string): Icon/image URL for the entry.
- `pos` (number): Position/rank in the original response.

## Failure Signals

- **API drift**: If `code` is not `0`, the API may have changed or is temporarily unavailable. The command should surface the error code.
- **Empty list**: If `list` is empty or missing, the command should return an `EMPTY_RESULT` error.
- **Rate limiting**: No rate limiting has been observed, but excessive requests could trigger temporary blocks.
- **Network errors**: Standard HTTP timeouts or DNS failures should be propagated as `NETWORK_ERROR`.

## Capture Assessment

This path should be captured because:
1. It uses an official, public API endpoint that requires no authentication.
2. The response structure is stable JSON with clear fields.
3. It directly satisfies the recurring need to check Bilibili trending topics.
4. The runtime is `node`, making it lightweight and fast with no browser dependency.
