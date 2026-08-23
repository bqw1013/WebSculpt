# Evidence: producthunt/get-launch-comments

This document records the research and validation evidence for the `producthunt/get-launch-comments` command.

## Exploration Path

The command library snapshot taken when this workspace was created had no name conflict and already contained the related `producthunt/get-reviews`, `producthunt/get-product`, `producthunt/get-stories`, and forum commands. The path was verified during exploration. Exploration used the already attached user Chrome session; no new browser was opened or launched.

The capture follows the verified browser path: navigate to the launch URL, wait for the launch modal and comments feed, extract rendered launch/comment nodes, and use the verified `?page=2#comments` URL shape for page 2. The Reviews route and `/p/linear` forum route were treated as separate surfaces and are not used by this command.

## Verified URLs

- `https://www.producthunt.com/products/linear/launches/linear-diffs` — title `Linear Diffs - A new way to review PRs, directly inside Linear | Product Hunt`.
- `https://www.producthunt.com/products/linear/launches/linear-diffs?page=2#comments` — same title; browser normalized the rendered URL to `https://www.producthunt.com/products/linear/launches/linear-diffs?page=2`.
- `https://www.producthunt.com/products/linear/launches/work-with-linear` — title `Work with Linear - Join a company that works with Linear | Product Hunt`.
- `https://www.producthunt.com/products/linear` — title `Linear: The product development system for teams and agents. | Product Hunt`; used to confirm product and launch links.
- `https://www.producthunt.com/p/linear` — title `Linear Forums on Product Hunt | Product Hunt`; used as a boundary check and excluded from this command.

## Structural Evidence

Verified launch-page structure:

- `data-test="modal"` contains the launch title, subtitle/description, launch tags, hunter/maker context, featured date, day/week ranks, and launch vote text such as `Upvote 180`.
- `data-test="comments-feed"` contains the rendered launch discussion. `data-test="comment-form"`, `comment-form-editor`, and `form-submit-button` are composer controls, not returned comments.
- `data-test="comments-sort-input"` visibly reports `Best`; no alternate sort query or parameter was verified, so `sort` is not exposed.
- `thread-5409300` / `comment-5409300` through `thread-5410690` / `comment-5410690` were observed on page 1 for Linear Diffs. Page 2 rendered `thread-5410961`, `thread-5411249`, and `thread-5411473`.
- Comment samples contain stable-looking id, author, optional affiliation/product, hunter marker, body, upvote count, `Reply`/`Report`/`Share`, and relative time fields.
- Linear Diffs showed `10 Comments` and a verified page-2 navigation link. Work with Linear showed `6 Comments`, the same comment/feed controls, and no page navigation because its visible set fit on one page.

The verified parameter contract is therefore product slug + launch slug + positive `page` (default 1) + `detailed` (default false). No `limit` or `sort` parameter is included because neither was verified as a working input path.

## Failure Signals

The command requires Chrome/Edge remote debugging and uses the existing browser session runtime. A non-404 page without the launch modal or comments feed is treated as `DRIFT_DETECTED`; a 404/not-found page is `NOT_FOUND`; an empty rendered feed is `EMPTY_RESULT`; malformed slugs/page/detailed values are `INVALID_PARAM`. Product Forum URLs under `/p/{slug}` are intentionally outside this command's scope.

## Capture Assessment

Capture is justified: the launch route, DOM fields, comments feed, and page-2 navigation were exercised on two real launches, and the path is reusable for launch-specific discussion retrieval. The command must keep compact output focused on launch summary plus comments and reserve full launch metadata/comment raw text for detailed mode.
