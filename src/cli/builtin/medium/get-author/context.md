# Context

## Precipitation Background (Why This Command Exists)

Part of the Medium command family expansion. The existing commands (search, get-article, get-staff-picks, get-tag-trending, list-topics) can find authors but cannot read an author's profile or profile tabs. Explored 2026-08-06; the explore assessment passed, then captured.

## Value Assessment

High reuse value: author profile lookup is a standard follow-up to search/article/tag results (chain: `medium/search` → `medium/get-author` → `medium/get-article`). One command covers five profile tabs, saving repeated browser exploration per tab.

## Page Structure

- Tab URLs: `/@<user>` (home), `/@<user>/reposts`, `/@<user>/activity`, `/@<user>/lists`, `/@<user>/about`. Lists tab exists only when the author has public lists.
- Profile metadata: `window.__APOLLO_STATE__` → the `User:<id>` node whose `username` matches case-insensitively (other User nodes are the viewer or post authors — never pick "the richest node"). Avatar = `https://miro.medium.com/v2/resize:fill:176:176/<imageId>`.
- Home: user node key `homepagePostsConnection:{"paging":{"limit":10},"includeDistributedResponses":true}` → 10 `Post:*` refs with full fields. **Scrolling does NOT grow `__APOLLO_STATE__`** (load-time snapshot); extra items are parsed from `article[data-testid="post-preview"]` DOM cards (h2=title, h3=subtitle, `a[href^="/@"]`=author, single-segment absolute medium.com link=publication, href ending in 12-hex=post URL, last img=preview, footer text tail=claps/responses).
- Activity: activity line (`<actor>\n<action>\n·\n<date>`) as sibling before each card inside the card's parent wrapper; stream ends with "You're all caught up!".
- Lists: `div[data-testid="readingList"]` cards with `readingListName`, `a[href*="/list/"]`, and "<N> stories" text.
- About: `User.about` is a JSON **string** of Medium content-model paragraphs.
- Subdomain redirects (`@eve-arnold` → `eve-arnold.medium.com`) are followed automatically by `page.goto`.

## Environment Dependencies

Browser runtime: WebSculpt daemon attaches to user Chrome/Edge via CDP (remote debugging required). No login needed. Polite pacing included (random waits, small mouse move, gentle scrolls) — cheap, keeps the interaction polite; no rate limiting observed during exploration.

## Failure Signals

- 404 user: page title "Medium", body contains "PAGE NOT FOUND", no username-matching User node → `NOT_FOUND` (body text checked first, fail fast).
- Apollo state not hydrated within 15s → `PAGE_LOAD_FAILED`.
- Suspended account (`User.isSuspended`) → `NOT_FOUND`.
- Drift: `article[data-testid="post-preview"]` / `[data-testid="readingList"]` disappearing while the profile loads fine indicates markup change.
- Empty reposts/activity/lists are legitimate empty results, not errors ("has no recent ... yet." messages).
- **Lists hydration race (2026-08-06)**: the Lists tab cards are rendered client-side after `domcontentloaded`. Starting the scroll scan immediately can yield zero cards and exit early, producing an empty array even when public lists exist. Fix: wait up to 8s for the first `[data-testid="readingList"]` card before scanning; timeout is non-fatal (author may simply have no public lists).

## Repair Clues

- If Apollo field names change, the DOM post-preview parser works standalone for home/reposts; profile metadata then needs a DOM fallback (name/bio/counts are visible in the page header).
- If `__APOLLO_STATE__` is removed entirely, fall back to `POST /<host>/_/graphql` (observed ops: VisitorQuery, UserCatalogsListQuery, ...) via page-context fetch, or full DOM extraction.
- Non-empty reposts structure was never observed during capture (7/7 profiles empty); if reposts output looks wrong, re-explore with a user who actually reposts and compare against the home card parser.
