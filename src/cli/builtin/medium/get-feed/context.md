# Context

## Precipitation Background (Why This Command Exists)

Planned as part of the Medium command family plan: the family covered search, tags, staff picks and articles, but not the homepage feed — Medium's main content-discovery entry. Explored 2026-08-06; full evidence in `evidence.md` in this workspace.

## Value Assessment

High reuse: homepage feed is the starting point of any Medium monitoring/discovery workflow, and `url` chains directly into `medium/get-article`. One command covers both homepage tabs. Saves the whole attach → navigate → scroll → parse cycle (~30+ interactions) per call.

## Page Structure

- URLs: `https://medium.com/?feed=for-you` / `https://medium.com/?feed=featured`.
- Cards: `article[data-testid="post-preview"]`; `h2` title, `h3` subtitle, `aria-label` = title.
- Homepage `__APOLLO_STATE__` embeds only Staff Picks — do NOT try to read the main feed from Apollo; DOM is the verified surface.
- Byline: author link `a[href^="/@"]` (username-only path, non-empty text); publication = the other link in the byline container; date = byline leaf matching `^(\d+[smhdw] ago|Just now|Mon D{1,2}(, YYYY)?)$`.
- Counts: svg `<desc>`/`<title>` labels `A clap icon` / `A response icon` / `Repost icon`; nearest numeric span above.
- Member-only: `button[aria-label="Member-only story"]`.
- Hint: `div` whose first leaf is "Because you follow" containing `a[href*="/tag/"]`.
- Lazy load: initial 10 cards, +~5 per 1-2 smooth scrolls (verified 10→30 over 8 scrolls). Loop stops at limit, 4 stale scrolls, or 80 scrolls.
- Featured empty state: `h1/h2` text "No featured stories" → success with `emptyReason`.

## Environment Dependencies

- Requires Chrome/Edge with remote debugging + logged-in Medium session (`authRequired: required`). Login probe: Apollo key `UserViewerEdge:userId:<id>-viewerId:<same id>`; fallback signal: visible "Sign in" CTA.
- Polite pacing: randomized waits (0.2-1.7s), small smooth scrolls, occasional mouse jiggles; keeps total runtime close to plain scrolling.
- The daemon runs this command in its own browser session, independent of explore sessions.

## Failure Signals

- `AUTH_REQUIRED`: logged out (sign-in CTA detected).
- `PAGE_LOAD_FAILED`: Apollo never hydrated (20s).
- `DRIFT_DETECTED`: no cards and no featured empty state (20s) — likely card selector or page layout changed.
- Silent degradation: icon-label drift zeroes the counts; date-format drift nulls `publishedAt`. Check counts first when output looks odd.
- **Hydration timing (observed 2026-08-06, repairs 1-2)**: card skeletons render before the engagement svgs hydrate — both at initial load AND for each newly lazy-loaded batch (with limit=100, zero-clap clusters appeared at indices 40-44, 70-74, 80-84, 90-94 = exactly the fresh 5-card batches per scroll). Mitigation: best-effort wait for the first card's clap icon after load (8s) and for the LAST card's clap+repost icons before every collect in the scroll loop (4s), both non-fatal. If counts intermittently return 0 again, lengthen these waits.
- Non-empty featured feed was NOT observable during capture (the account followed no publications with featured stories); its lazy-load is handled by the same generic scroll loop but unverified.

## Repair Clues

- If cards vanish: re-inspect homepage DOM; Medium renames `data-testid` occasionally. Sibling commands (`get-tag-trending`, `get-staff-picks`) share Medium card idioms — cross-check their selectors.
- If counts break: Medium may localize/rename svg `desc`/`title` strings; fall back to ordering the three numeric spans in the card footer (claps, responses, reposts — verified order during explore).
- If login probe misfires: re-check `UserViewerEdge` key shape in `window.__APOLLO_STATE__` while logged in.
