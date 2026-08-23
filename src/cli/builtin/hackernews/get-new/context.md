# Context

## Precipitation Background (Why This Command Exists)

The Hacker News command library had a current-front-page command and a search command, but no command for the chronological `new` feed. This command was requested to complete the core read-only HN views without adding a browser or login dependency.

## Value Assessment

Latest story monitoring is a common reusable workflow for news discovery, trend monitoring, and automation. A structured command avoids repeated manual browsing and normalizes timestamps, discussion links, and engagement fields.

## Page Structure

The command requests `https://hacker-news.firebaseio.com/v0/newstories.json`, then fetches the earliest IDs in that ordered list through `https://hacker-news.firebaseio.com/v0/item/{id}.json`. The required item fields are `id`, `type`, `title`, `by`, and `time`; `url`, `score`, and `descendants` are normalized when absent. HN discussion URLs are constructed as `https://news.ycombinator.com/item?id={id}`.

## Environment Dependencies

This is a Node command using HN's documented public Firebase API. It requires network access only. It creates at most six concurrent item requests, imposes a 10-second timeout per request, retries a transient network failure once, and does not retry HTTP 429.

## Failure Signals

If `newstories` is not an array, contains a non-integer ID, or an eligible story lacks a required field, the command throws `DRIFT_DETECTED`. Deleted, dead, and non-story items are skipped. HTTP 429 maps to `RATE_LIMITED`; other non-success responses map to `API_ERROR`.

## Repair Clues

If the official API changes, revisit the HackerNews/API documentation first and update the evidence before changing implementation. The rendered `https://news.ycombinator.com/newest` page is a possible fallback source, but it should only be adopted after a new explore phase verifies that route and its extraction contract.
