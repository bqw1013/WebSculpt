# Evidence: medium/get-author

This document records the research and validation evidence for the `medium/get-author` command.

## Exploration Path

Command library overlap check: `websculpt command list medium` showed `get-article`, `get-staff-picks`, `get-tag-trending`, `list-topics`, `search` — none returns author profile metadata or profile tab content. No conflict.

Explored with `@playwright/cli` 0.1.13 attached to the user's Chrome via CDP (one tab reused via `goto`). Full trace with data samples was recorded and the explore assessment passed. The browser runtime contract was read before implementing the draft.

## Verified URLs

- https://medium.com/@MediumStaff — profile metadata, home tab, 5-tab bar including Lists
- https://medium.com/@umairh — home tab: Apollo `homepagePostsConnection` (10 posts) + scroll lazy-load (5 scrolls → 60 DOM cards)
- https://medium.com/@umairh/about — about section (long bio as JSON-string content model)
- https://medium.com/@umairh/reposts and https://medium.com/@umairh/activity — empty states
- https://medium.com/@MediumStaff/lists — lists section, 20 `readingList` cards
- https://medium.com/@MediumStaff/activity — activity entries ("clapped" line + post-preview card), stream ends with "You're all caught up!"
- https://medium.com/@MediumStaff/reposts — reposts empty state
- https://eve-arnold.medium.com/reposts — subdomain redirect target of https://medium.com/@eve-arnold/reposts
- https://medium.com/@this-user-does-not-exist-xyz123 — 404 behavior ("PAGE NOT FOUND")

## Structural Evidence

- **Profile metadata**: page embeds `window.__APOLLO_STATE__`. The profile owner is the `User:<id>` node whose `username` matches the requested username case-insensitively (other `User:*` nodes are the viewer or post authors — never pick by "richest node"). Verified fields: `name`, `username`, `bio`, `imageId`, `socialStats.followerCount`, `socialStats.followingCount`. Avatar URL: `https://miro.medium.com/v2/resize:fill:176:176/<imageId>` (verified against rendered `<img>` tags).
- **Tab URLs**: `/@<user>` (home), `/@<user>/reposts`, `/@<user>/activity`, `/@<user>/lists`, `/@<user>/about`. The Lists tab only exists when the author has public lists (@MediumStaff has 5 tabs, @umairh has 4).
- **Home (Apollo)**: user node key `homepagePostsConnection:{"paging":{"limit":10},"includeDistributedResponses":true}` holds 10 initial `posts` refs. Each `Post:*` node has `title`, `creator.__ref` (User), `collection.__ref` (Collection with `name`/`slug`), `tags[].__ref` (Tag with `displayTitle`), `previewImage.id`, `extendedPreviewContent.subtitle`, `mediumUrl`, `clapCount`, `isLocked`, `postResponses.count`, `firstPublishedAt`, `latestPublishedAt`, `pinnedAt`, `readingTime`, `uniqueSlug`.
- **Lazy loading**: scrolling grows the DOM only — `window.__APOLLO_STATE__` is a load-time snapshot and does NOT update (verified: 10 posts in state vs 60 `article[data-testid="post-preview"]` cards after 5 bottom-scrolls). Strategy: first items from Apollo (rich fields), further items from DOM cards.
- **DOM story card** (`article[data-testid="post-preview"]`): `aria-label` and `h2` = title; `h3` = subtitle; `a[href^="/@"]` = author link; first absolute `a[href^="https://medium.com/<slug>"]` = publication link; post URL link ends with 12-hex postId and carries `?source=user_profile_page...`; byline text contains date like "Apr 10"; footer innerText tail is clap count then response count (e.g. "1K\n19"); last `<img>` = preview image. No reading time or tags in DOM cards.
- **Activity**: each entry is an activity line ("<name>\nclapped\n·\nJun 22") plus an `article[data-testid="post-preview"]` card inside one wrapper div. Wrapper classes are hashed (e.g. `am do ms`) — locate cards first, then read the preceding sibling text of the card's parent. Empty state: "<name> has no recent activity yet."
- **Reposts**: only the empty state was observed (7 profiles, message "<name> has no recent reposts yet."); reposts are recent-only. Non-empty rendering assumed identical to home post-preview cards — implementation reuses the home DOM extraction.
- **Lists**: cards are `div[data-testid="readingList"]`; inside: `div[data-testid="readingListName"]` (name), `a[href*="/list/"]` (URL; strip `?source=` query), `div[data-testid="readingListAuthor"]`, and card innerText ends with "<N> stories" (e.g. "1069 stories"). Initial render showed 20 cards.
- **About**: user node field `about` is a JSON **string** of Medium's content model `[{"type":"paragraph","children":[{"text":"..."}]}]`; paragraph texts joined with newlines give the long bio. Also rendered as plain text under `main`.
- **Subdomain redirect**: some authors redirect `medium.com/@<user>` → `<user>.medium.com` (verified @eve-arnold). `page.goto` follows automatically; profile URL in output stays the canonical `https://medium.com/@<username>`.

## Failure Signals

- **Missing user**: page title "Medium", body contains "PAGE NOT FOUND", and no `User:*` node with the requested username → `NOT_FOUND`. Check the body text first (fail fast), then require the username-matching node.
- **Apollo state missing**: `window.__APOLLO_STATE__` absent or not hydrated within timeout → `PAGE_LOAD_FAILED`.
- **Drift**: `article[data-testid="post-preview"]`, `div[data-testid="readingList"]`, or the username-matching User node missing while the page is not a 404 → `DRIFT_DETECTED`.
- **Empty sections are not errors**: reposts/activity/lists legitimately return empty arrays ("has no recent ... yet." messages; Lists tab may not exist at all).
- **Rate limiting**: none observed during exploration; keep random waits / light mouse moves / gentle scrolls to stay polite.
- **GraphQL**: dynamic data flows through `POST /<host>/_/graphql` (observed ops: VisitorQuery, NavBarQuery, UserCatalogsListQuery, ...). Not used — SSR Apollo state + DOM suffice.

## Capture Assessment

Capture as `medium/get-author` (browser runtime). The path is verified end-to-end for profile metadata, home, activity, lists, about, empty states, 404, and subdomain redirects; all inputs are parameterizable via username/section/limit. Known limitation: a non-empty reposts feed was never observed (7/7 profiles empty), so reposts extraction reuses the verified post-preview pattern with defensive fallbacks — flagged for future maintenance.
