# Context

## Precipitation Background (Why This Command Exists)

The original `reddit/search` command used the public PullPush archive API. In July 2026, all tested post and comment calls returned HTTP 502. Direct host requests to Reddit's public JSON and RSS search URLs also timed out, while Reddit's native search page loaded successfully in the user's attached Chrome. This workspace migrates the command from node/API runtime to browser/native-search runtime.

## Value Assessment

The command preserves the existing `query`/`limit` interface plus post/comment, sort, and time filters. It uses Reddit's platform-native search instead of a failing archive and parameterizes a reusable DOM extraction path. Raw tracking context, visible text, and links remain available for downstream normalization.

## Page Structure

Search URL: `https://www.reddit.com/search/?q=<query>&sort=<new|top>&t=<range>`. Comments add `type=comments`. Post cards use `[data-testid="search-sdui-post"]`; title links use `[data-testid="post-title"]`; the outer post card exposes `data-thingid` and JSON `data-faceplate-tracking-context`. Comment cards use `[data-testid="search-sdui-comment-unit"]`, with content in `[data-testid="search-comment-content"]` and thread counters in `[data-testid="search-counter-row"]`.

The page uses lazy loading. The command performs up to 16 randomized, low-frequency scroll steps and stops after the requested limit or three stagnant result counts. Wait times are intentionally short (initial 200–500 ms, inter-scroll 300–800 ms, pre-return 0–500 ms) while retaining occasional small mouse-wheel movements to keep the pattern human-like. Reddit may visibly rewrite a nonsense query; the command reports `correctedQuery` and `relevanceUnknown`.

## Environment Dependencies

Browser runtime requires Chrome remote debugging and the injected Playwright page. Public Reddit search normally does not require login. Direct HTTP access is not assumed. Navigation, waits, and scrolling are serial and randomized with short intervals to balance speed and polite pacing. CAPTCHA, challenge, login walls, and access blocks are reported rather than bypassed.

## Failure Signals

`ACCESS_RESTRICTED` indicates a challenge or block page. `AUTH_REQUIRED` indicates a login wall. `DRIFT_DETECTED` means neither result selectors nor an explicit empty state were present. `NAVIGATION_FAILED` distinguishes page/network failure from selector drift. Fewer records than requested are returned with `partial: true` and `paginationComplete: false`.

## Repair Clues

First re-verify the two result-container test ids and the post title hook. Preserve the `native` tracking/visible-text/link payload and null-field semantics when selectors change. If Reddit introduces a stable page-owned data response, it may be added only after fresh exploration; do not replay private signatures or bypass challenges. A prior alternate implementation is retained in the command's backup workspace for rollback.
