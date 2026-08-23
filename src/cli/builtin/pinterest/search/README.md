# pinterest/search

Search Pinterest by keyword and return Pins, Boards, or Users, plus related-query suggestions.

## Description

The command searches Pinterest with the required `query` and returns results depending on `type`: `pin` (default, individual image/video posts), `board` (user-curated collections, i.e. bookmark folders), or `user` (creators). It scrolls the results page to load more up to the `limit` (1-100, default 20), returning fewer with `partial: true` if results are exhausted first. For `type=pin` it also returns `related_queries` — the query-refinement suggestions Pinterest shows at the top of the results page (e.g. searching "keto recipes" yields Dinner, Easy, Healthy, Low carb...). Requires a logged-in browser session.

## Parameters

- `query` (required): Pinterest search keyword(s), e.g. `"keto recipes"`.
- `type` (optional, default `pin`): `pin` (individual Pins — image/video posts) / `board` (Boards — user-curated collections that group Pins by theme) / `user` (Pinterest users/creators).
- `limit` (optional, default 20, max 100): maximum number of results to return. Results lazy-load on scroll; the command scrolls until the limit is reached or results are exhausted (then returns fewer with `partial=true`).

## Return Value

```json
{
  "query": "keto recipes",
  "type": "pin",
  "related_queries": ["Dinner", "Easy", "Healthy", "Low carb"],
  "items": [
    {
      "id": "4785143352499319",
      "title": "Yummy keto for beginners recipes",
      "description": "Understanding portion sizes is key...",
      "imageUrl": "https://i.pinimg.com/originals/2d/34/32/...jpg",
      "sourceLink": null,
      "creator": { "username": "msolano571", "displayName": "Margarita" },
      "board": { "name": "cooking" },
      "pinUrl": "https://www.pinterest.com/pin/4785143352499319/",
      "reactionCount": 2
    }
  ],
  "count": 1,
  "partial": false,
  "maxLimit": 100
}
```

- `type=pin` items: `{ id, title, description, imageUrl, sourceLink, creator: {username, displayName}, board: {name}, pinUrl, reactionCount }`.
- `type=board` items: `{ id, name, owner: {username, displayName}, url, pinCount, imageUrl }`.
- `type=user` items: `{ id, username, displayName, followerCount, avatarUrl, profileUrl }` (`id` may be `null` — not exposed in the card DOM).
- `related_queries` is populated only for `type=pin`; it is an empty array for `board`/`user`.
- `sourceLink` is the outbound source URL when the Pin links out; `null` for Pins uploaded directly to Pinterest ("Uploaded by user").
- `partial` is `true` when results were exhausted before reaching `limit`.

## Usage

```text
websculpt pinterest search --query "keto recipes" --type pin --limit 20
websculpt pinterest search --query "keto recipes" --type board --limit 10
websculpt pinterest search --query "coffee" --type user --limit 5
```

## Common Error Codes

- `MISSING_PARAM`: query is empty.
- `INVALID_PARAM`: limit is not a positive integer.
- `LIMIT_EXCEEDED`: limit is greater than 100.
- `INVALID_TYPE`: type is not one of pin/board/user.
- `DRIFT_DETECTED`: Pinterest's native result selector changed.
