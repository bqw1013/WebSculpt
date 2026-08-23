# Evidence: producthunt/get-forum-threads

This document records the research and validation evidence for the `producthunt/get-forum-threads` command.

## Exploration Path

Checked the Product Hunt command library and existing `--help` contracts before browser work. Read the browser runtime contract. Attached to the existing Chrome session first, then inspected the rendered General forum page. A full Forums landing-page snapshot was too large, so the verified category page and thread-card DOM structure were used for the reusable route.

## Verified URLs

- https://www.producthunt.com/forums
- https://www.producthunt.com/p/general
- https://www.producthunt.com/p/general/what-are-the-5-tools-you-simply-couldn-t-do-your-work-without
- https://www.producthunt.com/forums/search?ref=sidebar

## Structural Evidence

The attached page URL was `https://www.producthunt.com/p/general` and its title was `General Forums on Product Hunt | Product Hunt`. The rendered DOM showed separate sidebar headings `Topic Forums` and `Product Forums`. Topic links included `/p/general`, `/p/vibecoding`, `/p/ama`, `/p/introduce-yourself`, and `/p/self-promotion`; product links included `/p/openai`, `/p/producthunt`, and `/p/vercel`.

On a selected forum page, thread links have the stable path boundary `/p/<forum-slug>/<thread-slug>`. A visible thread card contains a link with an `h3` title, an author profile link under `/@...`, a relative time label such as `2mo ago` or `8d ago`, optional `Featured` text, excerpt paragraphs, and numeric engagement buttons. The sidebar exposes a `Search all threads` link at `/forums/search?ref=sidebar`. No stable search submission parameter or numbered page/cursor control was observed, so the command contract is limited to one forum page's currently rendered thread slice and documents pagination as unsupported.

## Failure Signals

- Browser prerequisite failure is reported by the runtime as `BROWSER_ATTACH_REQUIRED`.
- A page presenting a 404/not-found signal is mapped to `NOT_FOUND`.
- A valid forum page with zero matching thread cards is mapped to `EMPTY_RESULT`.
- Missing `main` or the selected forum marker is mapped to `DRIFT_DETECTED`.
- Invalid forum slug, limit outside 1-50, or non-boolean detailed value is mapped to `INVALID_PARAM`.
- The Forums landing page can be too large for complete snapshot extraction; the implementation uses the selected `/p/<forum-slug>` page instead.

## Capture Assessment

Capture is appropriate: the route is parameterized by a stable forum slug, produces a reusable compact thread-list object, and has been verified in a live Chrome session. The command deliberately excludes unverified search and upstream pagination parameters and states its rendered-slice scope so it does not overclaim completeness.
