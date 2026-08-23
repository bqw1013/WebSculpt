# Context

## Precipitation Background (Why This Command Exists)

Hacker News exposes a dedicated `comments` navigation view that is not represented by the Firebase `newstories` feed. The command was requested to make that newest-comment stream reusable alongside the existing `get-new` and `get-past` commands.

## Value Assessment

The path is directly parameterized by a bounded limit and HN's stable ID cursor, so it can be reused for monitoring or summarizing the newest discussions without repeating browser exploration. Browser extraction is intentional: Algolia's comment index was observed to lag the live page, while Firebase items lack story/context fields.

## Page Structure

Start at `https://news.ycombinator.com/newcomments`. Each page has 30 numeric `tr.athing#<commentId>` rows in newest-first order. Within a row, use `.hnuser`, `.age[title]` and `.age a`, the `parent` and `context` links, `.onstory a`, and `.commtext`. The `More` anchor points to `/newcomments?next=<last-comment-id>`; follow it until the limit is met. The implementation assigns continuous ranks and rejects repeated cursors/comment IDs.

## Environment Dependencies

Requires an attached Chrome/Edge browser session supplied by the WebSculpt browser daemon; no Hacker News login or API key is required. The command performs read-only navigation and DOM extraction, does not click vote/login links, and keeps the request count bounded to at most two pages for the 1-50 contract. The explore path was verified with Playwright CLI guide instructions and the capture daemon attaches independently.

## Failure Signals

If `tr.athing` rows or required links disappear, the command throws `DRIFT_DETECTED`. If a `More` href is not `/newcomments?next=<digits>` or a cursor/comment repeats, it throws `DRIFT_DETECTED` rather than looping. Invalid limits throw `INVALID_PARAM`; a valid page with no rows throws `EMPTY_RESULT`; navigation errors throw `NETWORK_ERROR`. Runtime-level browser attach/timeouts remain runtime errors.

## Repair Clues

First re-check the live `/newcomments` DOM and its `More` cursor. Keep extraction on semantic classes and link text rather than transient snapshot refs. If a stable API is ever preferred, Algolia `search_by_date?tags=comment` is a fallback but should be treated as a different, eventually indexed view because it lagged HN during exploration and does not guarantee exact page parity. Firebase `/v0/item/<id>.json` can enrich a known comment but cannot replace story/context extraction without parent-chain traversal.
