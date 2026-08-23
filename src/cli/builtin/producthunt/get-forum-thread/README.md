# producthunt/get-forum-thread

## Description

Get one public Product Hunt forum thread by its URL slugs. The command returns the thread body, author, timestamps, product association when present, views/engagement labels, and a bounded page of replies. It supports both Topic Forums and Product Forums.

## Parameters

- `--forum <slug>` (required): forum slug from `/p/{forum}/{thread}`, such as `general` or `openai`.
- `--thread <slug>` (required): thread slug from the same URL.
- `--page <1-50>` (default `1`): 1-based replies page. Product Hunt uses `?page=N#comments`.
- `--limit <1-50>` (default `20`): maximum number of replies in the result.
- `--detailed <true|false>` (default `false`): adds body block types, reply product metadata, full reply metadata, and pagination links.

## Return Value

The result is a serializable object with `sourceUrl`, `forum`, `thread`, `replies`, and `pagination`. Compact mode returns a string array for `thread.body` and bounded reply fields. Detailed mode returns typed `bodyBlocks`, reply products, and pagination URLs.

## Usage

```text
websculpt producthunt get-forum-thread --forum general --thread what-are-the-5-tools-you-simply-couldn-t-do-your-work-without
websculpt producthunt get-forum-thread --forum openai --thread openai-day-winners-are-in --page 2 --limit 10 --detailed true
```

## Common Error Codes

- `MISSING_PARAM`: `forum` or `thread` was omitted.
- `INVALID_PARAM`: malformed slug, strict integer/range violation, or invalid boolean.
- `NOT_FOUND`: the requested thread does not exist.
- `EMPTY_RESULT`: a valid reply page beyond the available result set is empty.
- `DRIFT_DETECTED`: expected Product Hunt thread markers are missing or the page structure changed.
