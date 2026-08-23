# Evidence: reddit/search

This document records the research and validation evidence for the `reddit/search` command.

## Exploration Path

<!-- Record command library overlap checks and the guide or tool contract you consulted. -->

1. Imported the installed `reddit/search` command and reviewed its PullPush implementation, evidence, manifest, README, and context.
2. Ran valid post, comment, and alternate sort/time calls. All failed with `EXTERNAL_API_ERROR` because PullPush returned HTTP 502.
3. Created an explore workspace for the repair. `websculpt command list reddit` confirmed there was no alternate Reddit search command.
4. Host `curl` requests to Reddit JSON and RSS search each timed out after 20 seconds; PullPush returned the literal body `error code: 502`.
5. Attached dedicated Playwright session `<session>`, used one task-owned tab, verified its URL/title before interaction, and closed/detached it after recording evidence.
6. `websculpt explore assess` on that workspace returned `status: passed` after the user approved the browser replacement contract.

## Verified URLs

<!-- List each URL that was actually visited and used for extraction. -->

- `https://www.reddit.com/search.json?q=OpenAI&limit=2&sort=new&t=all&raw_json=1` — host connection timed out.
- `https://www.reddit.com/search.rss?q=OpenAI&limit=2&sort=new&t=all` — host connection timed out.
- `https://api.pullpush.io/reddit/search/submission/?q=OpenAI&size=2&sort=desc&sort_type=created_utc` — returned HTTP 502.
- `https://www.reddit.com/search/?q=OpenAI&sort=new` — loaded native post search in attached Chrome.
- `https://www.reddit.com/search/?q=OpenAI&type=comments&sort=top&t=year` — loaded native comment search and reached 34 cards after three low-frequency scrolls.
- `https://www.reddit.com/search/?q=machine%20learning&sort=top&t=month` — loaded post cards with tracking metadata.
- `https://www.reddit.com/search/?q=xyzabc123nonsense987654321&sort=new&t=all` — showed Reddit's visible approximate-query rewrite.

## Structural Evidence

<!-- Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

Post result containers are `[data-testid="search-sdui-post"]`; `[data-testid="post-title"]` provides title and permalink. The outer container provides `data-thingid` and `data-faceplate-tracking-context`. The latter was parsed as JSON with `post.id/title/nsfw/spoiler`, `profile.name`, `subreddit.name`, and `search.sort`.

Verified post sample:

```json
{
  "id": "t3_1uzmotq",
  "title": "The ultimate $800 YouTube machine.",
  "author": "lonewolff321",
  "subreddit": "SipsTea",
  "permalink": "https://www.reddit.com/r/SipsTea/comments/1uzmotq/the_ultimate_800_youtube_machine/",
  "relativeTime": "10d ago",
  "counters": "23K votes·1.9K comments"
}
```

Comment result containers are `[data-testid="search-sdui-comment-unit"]`; body text uses `[data-testid="search-comment-content"]`; thread counters use `[data-testid="search-counter-row"]`. Each verified card contained a thread link, subreddit link, author text/link, direct comment permalink, and visible comment score.

Verified comment sample:

```json
{
  "postTitle": "Tech workers of Reddit, what is a \"dirty secret\" about the AI industry that the general public doesn't realize?",
  "subreddit": "AskReddit",
  "author": "queen-adreena",
  "body": "Google make around $250 billion per year from controlling nearly all of the online advertising market. Open AI need to recoup $1.5 trillion ($1,500 billion) just to break even on their hardware investment costs. Their current revenue is just $13 billion per year.",
  "permalink": "https://www.reddit.com/r/AskReddit/comments/1prflaq/tech_workers_of_reddit_what_is_a_dirty_secret/nv1dgkj/",
  "scoreText": "16K votes"
}
```

Initial exploration produced 34 comment cards after three scroll-to-bottom iterations. A dedicated follow-up session (`<session>`) then exercised the same bounded loading strategy against `OpenAI` comment search: 12 iterations grew the DOM from 7 to 108 cards, all 108 identities were unique, and the run completed in 68,970 ms without stagnation or access restriction. This supports browser `maxLimit` 100. The command allows up to 16 bounded iterations for margin, deduplicates by native id/permalink, and exposes `paginationComplete` when the requested limit is fulfilled.

## Failure Signals

<!-- Describe known failure modes, dependencies, and drift signals. -->

- PullPush post and comment endpoints returned HTTP 502 for all tested parameters.
- Direct Reddit JSON/RSS HTTP requests timed out in the host environment; browser access worked.
- Missing native selectors without an explicit empty state indicate `DRIFT_DETECTED`.
- CAPTCHA, challenge, or access-block text indicates `ACCESS_RESTRICTED`; a blocking login prompt indicates `AUTH_REQUIRED`.
- Reddit may rewrite arbitrary queries and return approximate matches. The page text `Showing results for ...` is exposed as `correctedQuery` with `relevanceUnknown: true`.
- Results can omit absolute timestamps, author URLs, or exact numeric counters. Missing values are `null`, listed in `missingFields`, and never fabricated.
- If bounded scrolling cannot fulfill the requested limit, the command returns fewer records with `partial: true` and `paginationComplete: false`.

## Capture Assessment

<!-- State whether this command should be captured and why. -->

Capture the browser replacement. Reddit's native post and comment search pages were successfully exercised with real queries, sort/time filters, stable test ids, tracking metadata, and incremental scrolling. The path restores core search without relying on the failed PullPush archive, preserves visible platform-native data, and records browser and platform rate-limiting limitations explicitly.

### Installed Command Acceptance (2026-07-29 Asia/Shanghai)

All browser calls were executed serially against the installed `reddit/search` command with Chrome remote debugging enabled.

| Scenario | Real command | Result and key assertions | Duration |
|---|---|---|---|
| Happy post | `websculpt reddit search --query OpenAI --limit 3` | Success; 3 posts; native ids, titles, authors, subreddit, absolute/relative time, vote/comment text, links, and tracking context present; `paginationComplete=true`. | 2,971 ms |
| Comment branch | `websculpt reddit search --query OpenAI --type comment --sort popular --time year --limit 3` | Success; 3 comments; `type=comment`, `sort=popular`, `time=year`; comment body excludes author prefix; direct comment and thread links present; unavailable absolute comment time is `null` and listed in `missingFields`. | 2,591 ms |
| Generalization | `websculpt reddit search --query "machine learning" --sort popular --time month --limit 5` | Success; 5 posts; query, `popular -> top`, and `month` mappings reflected in source URL; first record had complete normalized fields. | 3,370 ms |
| Minimum boundary | `websculpt reddit search --query "C++" --limit 1` | Success; exactly 1 post; `C++` URL encoded; complete first record and `paginationComplete=true`. | 3,766 ms |
| Maximum boundary | `websculpt reddit search --query OpenAI --type comment --limit 100` | Success; exactly 100 results and 100 unique ids; `maxLimit=100`, `paginationComplete=true`; 12 bounded scroll iterations. | 45,341 ms |
| Missing query | `websculpt reddit search` | CLI rejected the required option before browser execution with `required option '--query <value>' not specified`; process exit code 1. | CLI-level |
| Fractional limit | `websculpt reddit search --query test --limit 1.5` | Failed as expected with `INVALID_PARAM` and positive-integer message. | 94 ms |
| Over maximum | `websculpt reddit search --query test --limit 101` | Failed as expected with `LIMIT_EXCEEDED` and explicit maximum 100. | 59 ms |
| Unsupported standard values | `websculpt reddit search --query OpenAI --type unsupported --sort strange --time decade --limit 2` | Success with 2 posts; effective defaults were post/default/all; `ignoredParams` recorded all three supplied values. | 2,362 ms |

Acceptance result: `PASS_WITH_KNOWN_RISK`. Core search, both result types, standard mappings, bounded pagination through 100 unique results, limit validation, and ignored-parameter semantics passed. Known external risks are Chrome remote-debugging availability, Reddit challenge/rate-limit behavior, query rewriting/approximate matching, and fields that Reddit does not render on every card. These conditions are surfaced through explicit errors or `partial`, `missingFields`, `paginationComplete`, and `relevanceUnknown`; no restriction bypass is used.
