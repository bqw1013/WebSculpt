# Context

## Precipitation Background (Why This Command Exists)

The command was requested as the read-only counterpart to the existing Hacker News `get-new`, `get-past`, and `get-top` views. Exploration confirmed that the Ask section has an official Firebase ID feed (`askstories.json`) whose complete order matched the public `/ask` page, so a Node/API command is sufficient and browser attachment is unnecessary.

## Value Assessment

The endpoint is parameterizable by a bounded limit, requires no login, and is useful for repeated monitoring of community questions and discussions. Reusing the verified ID-plus-item pattern avoids page parsing while preserving HN's own section ordering. The same normalized story-card fields are used by the other Hacker News commands, with `text` retained because Ask entries are self-posts.

## Page Structure

Primary API: `https://hacker-news.firebaseio.com/v0/askstories.json` (ordered numeric story IDs). For each selected ID, fetch `https://hacker-news.firebaseio.com/v0/item/{id}.json`. The comparison page is `https://news.ycombinator.com/ask`; its rows match `<tr class="athing submission" id="{id}">` and contain rank, title, author, score, timestamp, and comments links. The command intentionally uses the API rather than page selectors.

## Environment Dependencies

Node runtime with built-in `fetch` and `AbortController`; no third-party packages, browser, login, or API key. Detail requests are limited to six concurrent workers and each request has a 12-second timeout with one retry for network/timeout failures. The API is public; avoid adding unbounded polling or concurrency.

## Failure Signals

`INVALID_PARAM` covers malformed/out-of-range limits. HTTP 429 maps to `RATE_LIMITED`; other non-success responses map to `API_ERROR`; network/timeout failures after retry map to `NETWORK_ERROR`. A non-array ID list or malformed required item fields maps to `DRIFT_DETECTED`; deleted/dead/non-story items are skipped and an entirely ineligible feed maps to `EMPTY_RESULT`. Title prefixes are not a membership filter: current data included 15 Ask-prefixed, 1 Tell-prefixed, and 13 unprefixed entries.

## Repair Clues

If `askstories.json` changes shape, inspect the official HN API documentation and compare against `/ask` again before changing extraction. If item fields change, update the required-field checks and output mapping together, then re-run rank/order, text, and titleKind tests. Do not substitute Algolia keyword search without explicitly accepting a semantic change: `search --type ask_hn` is not the Ask stream.
