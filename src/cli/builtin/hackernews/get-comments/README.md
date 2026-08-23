# hackernews/get-comments

Generated draft for a `browser` runtime command.

## Description

Returns the newest comments from Hacker News's `comments` navigation view (`/newcomments`) in the same newest-first order shown by HN. It reads the server-rendered page in an attached browser and follows HN's cursor-based `More` links when needed.

## Parameters

- `--limit <1-50>` (optional, default `15`): number of comments to return. Values outside the range or non-integers return `INVALID_PARAM`.

## Return Value

An array of comment records:

```text
{
  rank, commentId, commentText, commentHtml, author,
  createdAt, createdAtUnix, commentUrl, parentUrl, contextUrl,
  storyId, storyTitle, storyHnUrl
}
```

`rank` is the 1-based HN page order across fetched pages. `commentText` is readable text while `commentHtml` preserves HN paragraph/link markup. `parentUrl` is the direct parent item (or the story for a top-level comment); `contextUrl` is HN's context link; `storyHnUrl` and `storyTitle` identify the containing story.

## Usage

```
websculpt hackernews get-comments
websculpt hackernews get-comments --limit 50
```

## Common Error Codes

- `INVALID_PARAM`: `limit` is missing, non-integer, or outside 1-50.
- `EMPTY_RESULT`: HN's valid comments page contains no comments.
- `DRIFT_DETECTED`: expected HN comment rows, fields, or cursor pagination changed.
- `NETWORK_ERROR`: navigation to the HN page failed. Browser runtime attachment failures such as `BROWSER_ATTACH_REQUIRED` are reported by the runtime.
