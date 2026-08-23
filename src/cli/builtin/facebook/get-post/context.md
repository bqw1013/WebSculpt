# Context

## Precipitation Background (Why This Command Exists)

Facebook post permalinks are produced everywhere in the product (home feed, profiles, pages, groups, search). Users need the full post text and comments for a single post, but Facebook's DOM is heavily GraphQL-driven with obfuscated class names. This command captures the explore-verified extraction path so a single post (any of five URL forms) can be read with stable ARIA/role/URL anchors instead of re-deriving selectors each time. It complements `facebook/search` (discovery) and the parallel `facebook/get-feed` / `facebook/get-group` commands (feed/group post permalinks).

## Value Assessment

High reuse: any time a user has a Facebook post link, `get-post` returns the full post and comments without manual copy-paste. Comments with nested replies are a common ask; the incremental "view more comments" paging is encapsulated. Saves 10+ minutes of manual DOM work per use.

## Page Structure

- Post pages (`/posts/{pfbid}`, `/groups/{gid}/permalink/{pid}/`, `/groups/{gid}/posts/{pid}/`): all posts and comments are `div[role="article"]`. Layout: index 0 = sidebar related post, 1-2 = empty placeholders, index 3 = main post, followed by comments.
- Main post identification: the largest `div[role="article"]` whose text contains `分享对象：` and whose aria-labels contain a like count `赞：N位用户`. Fallback: the largest article.
- Group posts (`/groups/{gid}/posts/{pid}/`): the URL post id is extracted from the `/groups/{gid}/posts/{pid}/` path segment (numeric; the feed emits non-canonical ids that only resolve in this form). The id is parsed from the INPUT url (`urlIdFromString`) as well as `location.href`: after `domcontentloaded` Facebook often still shows the group feed (href `/groups/{gid}/`), and reading only `location.href` at extraction time is racy.
- Settling wait: for standard URLs carrying an id the command polls (up to ~12s) until the href is a post URL form AND an article whose HTML contains the id exists, so extraction runs on the post page rather than the feed. This eliminated a non-deterministic wrong-post bug (same URL returned different sidebar/feed articles on each run).
- Main-post id matching: scan ALL `div[role="article"]` for the id in their outerHTML and take the first DOM-order match. Candidate link matching (`a[href].href.includes(id)`) is deliberately secondary: sidebar "recommended" cards can contain a RESOLVED link href that includes the target id (noisy), while the target article's own HTML carries it. Posts with no likes have no `赞：N位用户` aria, so they are excluded from the candidate filter entirely — the outerHTML scan is the only way to reach them.
- Text anchor: `div[data-ad-preview="message"]` (main post) or `div[dir="auto"]` (comments). Group posts may lack the data-ad-preview anchor. Text extraction excludes elements inside nested comment articles (comment text like a one-word reply must not become the post text) and halves exact-duplicated messages that some group posts render twice.
- Time: absolute aria-label `2026年8月3日周一14:58`, else relative text like `6天`.
- Stats: like-count aria; comments/shares from the action-bar numeric text sequence (reactions, comments, shares order).
- Replies: collapsed as `查看N条回复` buttons; after expansion replies are `div[role="article"]` nested ~3 DOM levels deeper than top-level comments (class-independent discriminator). Replies follow their parent comment in document order.
- Comment paging: `[role="button"]` with text `查看更多评论`; each click loads ~10 more; button persists until exhausted.
- Video/reel/watch pages: three layouts, unified in `extractVideoPost`:
  - `/reel/{id}`: `role="main"` text starts with `{author} · 关注`, followed by the audio credit `{name} · 原声`, the caption, UI tokens (`展开隐藏翻译`), and a live stat suffix (`1,595451962,867127801`). The h2 heading is sometimes TRUNCATED (observed: role=main carried a longer prefix than the h2), so the role=main "· 关注" prefix is authoritative. Comments hide behind an `[aria-label="评论"]` button.
  - `/videos/{author}/{id}` and `/watch/?v={id}`: `role="main"` is just the player ("0:00 / 0:08"); the post header (author heading with `已认证账户` badge, time, `分享对象：`, follow `关注` button) renders OUTSIDE role=main. Verified authors appear in an H2 heading with a badge; non-verified authors in the heading nearest the follow button. `/{author}/videos/{id}` redirects to `/watch/?v={id}` for pages. Watch-page post body captions follow the `作者` badge marker; `/videos/` descriptions render as non-comment `div[dir="auto"]`. Caption cleanup: pick the SMALLEST non-comment container carrying the `作者` marker + CJK text; strip UI tokens, trailing stat numbers, cut at ` | `, and drop a long (>=20 char) trailing ASCII phrase glued to a caption URL (related-video titles like "Today's Top Japan and World News" have no separator from the URL).
  - Dead video URLs: bare `/videos/{id}` for a video that only resolves under `/watch/?v=` (or deleted videos) renders `页面无法显示` inside role=main — detect that BEFORE the ready-check and return NOT_FOUND (previously returned an empty success).
  - Ready-check (2026-08-08 fix): waits for the author/post header to render (`· 关注` prefix, follow button + video element, or an author heading with badge) instead of "role=main has >5 chars" (the dead-video error page and the bare player clock both matched the old check). After ready, a fixed 1200ms settle keeps same-URL runs consistent.
  - Reel stats are animated/split spans (e.g. "45"+"196" for 45,196) and are NOT reliably parseable → `stats` is empty for reels. Like counts come from `赞：N位用户` / `赞：N 万位用户` aria-labels; `万` is expanded (x10000). Video posters are not placed in the DOM until playback, so `/videos/` & `/watch/` `media` is often empty while reels expose posters.
- permalink.php: with a `pfbid` in `story_fbid` it does NOT resolve (page shows "内容暂时无法显示"); the command navigates directly and returns NOT_FOUND via that failure signal. Legacy numeric `story_fbid` permalink.php URLs may still work.

## Environment Dependencies

- Requires Chrome/Edge with remote debugging enabled and an active Facebook login (browser runtime; the command CDP-attaches to the user's browser, reusing login cookies).
- Polite pacing: the command uses natural random delays between actions and click-driven paging instead of rapid scrolling. Run calls serially with gaps; never hammer.
- The browser connection is independent of the explore-phase `@playwright/cli` session. First connection may show a Chrome "allow remote debugging" system prompt.
- Timing: page loads are `domcontentloaded` + wait; heavy comment paging can add seconds. Command timeout is 20 minutes.

## Failure Signals

- `role="main"` shows `内容暂时无法显示` / "content temporarily unavailable" → NOT_FOUND (deleted/private/permission change).
- `input[name="email"]` present or URL contains `checkpoint` / `login_challenge` → AUTH_REQUIRED (logged out).
- Zero `div[role="article"]` on a standard post page after a wait → DRIFT_DETECTED (page structure changed or render regression).

## Repair Clues

- If main-post identification fails, check that the largest-article fallback still holds; the sidebar related post may also have `分享对象`.
- If group-post identification regresses, re-verify (1) the URL-id extraction regexes (`/groups/{gid}/posts/{pid}/`, `/groups/{gid}/permalink/{pid}/`), (2) the settling wait (poll must require a post URL form, not just any article carrying the id — the feed also carries it), and (3) that the outerHTML scan still targets the right article (the main post article's outerHTML carries its own post id; nested comment articles may also carry it inside the main article, so the scan takes the first/outermost match).
- If comment counts are wrong, verify the `查看更多评论` button text hasn't changed locale; both Chinese and English variants can be matched.
- If replies stop grouping, re-verify the DOM-depth delta (replies were 3 levels deeper than top-level comments); the threshold can be relaxed to "deeper than the modal depth".
- permalink.php behavior: if Facebook starts resolving pfbid permalinks again, the normalize-rewrite can be removed; keep the NOT_FOUND detection as the guard.
- Video ready-check regressions: if video pages start returning empty success again, check `detectVideoState`'s ready signal first — it must require the author/post header (follow button, badge heading, or "· 关注" prefix), not just any role=main text. If the dead-video error text changes wording, extend the `unavailable` regex in both `detectState` and `detectVideoState`.
- If the `author` heading extraction regresses: the h2 heading can be truncated on reels, so keep the role=main "· 关注" prefix as the primary reel-author source; use the badge heading only for `/videos/` & `/watch/`.
