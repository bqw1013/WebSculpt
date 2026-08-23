# Context

## Precipitation Background (Why This Command Exists)

The existing Hacker News commands cover feeds and search, but there was no command for opening one story and reading its full discussion. This command was requested to support informed participation in HN threads: inspect the original post, understand existing replies, and then decide whether to comment. The verified path uses the same public Firebase API already used by `hackernews/get-ask` and `hackernews/get-new`.

## Value Assessment

This path is reusable for any public Hacker News story, including Ask HN, Show HN, link posts, and posts with no comments. It avoids repeating manual navigation and provides structured nesting for downstream analysis. It is complementary to `hackernews/get-comments`, which is a global newest-comments feed, and `hackernews/search`, which is not a thread reader.

## Page Structure

The root item is fetched from `https://hacker-news.firebaseio.com/v0/item/<story-id>.json`. The story's `kids` array contains child comment IDs in HN order. Each comment is fetched from the same endpoint and may contain its own `kids` array. The command recursively walks those arrays depth-first, emits live comments with `depth` and `parentId`, and stops after the configured live-comment limit. The canonical web URL is `https://news.ycombinator.com/item?id=<story-id>`.

## Environment Dependencies

No login, browser session, or API key is required. This is a node runtime command using global `fetch`, a 12-second request timeout, and one retry for transient network failures. Requests are sequential and bounded by a maximum of 200 returned comments. No third-party dependencies are used.

## Failure Signals

The root must remain a non-deleted story with numeric `id` and `time`, string `title` and `by`, and an optional numeric `kids` array. Child `kids` arrays must contain numeric IDs. Missing required fields or a changed response shape throws `DRIFT_DETECTED`; HTTP 429 throws `RATE_LIMITED`; missing roots throw `NOT_FOUND`.

## Repair Clues

If Firebase item responses change, compare against the public item page at `/item?id=<id>` and the existing Firebase implementations for `get-ask` and `get-new`. A browser-runtime implementation is the fallback only if the API no longer exposes enough thread data; do not add browser automation merely because another HN command uses it. Preserve the output contract and dead-comment filtering when repairing the command.
