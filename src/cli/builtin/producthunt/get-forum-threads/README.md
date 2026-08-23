# producthunt/get-forum-threads

## Description

List the currently rendered discussion threads for one Product Hunt Topic Forum or Product Forum. The command does not open individual threads and does not return thread bodies, comments, or replies.

## Usage

```bash
websculpt producthunt get-forum-threads
websculpt producthunt get-forum-threads --forum openai --limit 10
websculpt producthunt get-forum-threads --forum general --detailed true
```

## Parameters

- `--forum <slug>` is optional and defaults to `general`. It accepts a Topic Forum slug such as `general` or a Product Forum slug such as `openai`.
- `--limit <number>` is optional and defaults to `20`; it trims the currently rendered thread cards and must be an integer from `1` through `50`.
- `--detailed <true|false>` is optional and defaults to `false`; detailed mode adds bounded card text and raw numeric engagement values.

The verified forum page exposes a forum slug but did not expose a stable upstream search query or numbered page/cursor parameter. Those options are intentionally not accepted. `pagination.supported` is therefore `false`, and the result scope states that this is the currently rendered page slice.

## Return Value

The result contains:

- `sourceUrl` and `retrievedAt` for traceability;
- `forum.slug` and `forum.type` (`topic`, `product`, or `unknown`);
- compact `threads` with `slug`, `title`, `url`, `author`, `timeLabel`, `excerpt`, and `isFeatured`;
- `count`, `limit`, `scope`, and explicit pagination metadata.

Detailed mode additionally returns each card's bounded `cardText` and `engagementValues`. It never returns comments or a full thread body.

## Common Error Codes

- `INVALID_PARAM`: forum slug, limit, or detailed value is invalid.
- `NOT_FOUND`: the requested forum page was not found.
- `EMPTY_RESULT`: the forum page loaded but contained no rendered thread cards.
- `DRIFT_DETECTED`: the expected forum marker or main content structure was not found.
- `BROWSER_ATTACH_REQUIRED`: produced by the WebSculpt runtime when Chrome/Edge remote debugging is unavailable.
