# Evidence: kickstarter/get-creator

This document records the research and validation evidence for the `kickstarter/get-creator` command.

## Exploration Path

Explored via `websculpt explore`. Browser automation used `@playwright/cli` attach against the user's Chrome with remote debugging enabled.

Runtime decision: **browser**. Direct node/curl requests to www.kickstarter.com are blocked by Cloudflare TLS fingerprinting (403 managed challenge) — verified first-hand in this explore (curl 403) and previously in list-categories exploration (node 5/5 challenges). The command needs a real browser session to reuse the SSR-rendered HTML.

Library check: `websculpt command list kickstarter` shows one existing command `kickstarter/search` (browser runtime, project discovery search). No existing get-creator command; relation is `new` (complements `kickstarter/search`).

Network note: a FlClash proxy node failure initially blocked international traffic; after switching to a reachable node, www.kickstarter.com became reachable (curl 403 CF challenge, browser 200).

## Verified URLs

verified-urls (all actually visited and used for extraction):
- https://www.kickstarter.com/profile/baroque — profile header + sub-nav (about/created/comments routes)
- https://www.kickstarter.com/profile/baroque/about — bio "Crafting premium, one-of-a-kind tarot decks..." + website baroquetarot.com
- https://www.kickstarter.com/profile/baroque/created — data-projects 13 projects, full field set
- https://www.kickstarter.com/profile/sjgames/about — bio + website www.sjgames.com (second-creator cross-check)
- https://www.kickstarter.com/profile/sjgames/created — total 46 (tab label), page 1 = 32 projects
- https://www.kickstarter.com/profile/sjgames/created?page=2 — remaining 14 projects (page size 32 confirmed)
- https://www.kickstarter.com/profile/sjgames/created?page=3 — empty page signal (no data-projects, "未發起專案")
- https://www.kickstarter.com/profile/cmon/created — 32 projects, all successful
- https://www.kickstarter.com/profile/zombieorpheus/created — 15 projects
- https://www.kickstarter.com/profile/zzz-nonexistent-user-9x9x9x9x — invalid creator 404 signal
- https://www.kickstarter.com/graph — POST 200 with X-CSRF-Token + cookie; me/rootCategories/project(slug:).creator verified

## Structural Evidence

### Profile header (present on /about, /created, /profile/{slug})

- name: `.profile_bio h2 a` → "Baroque Publishing"
- backed count: `.profile_bio .backed` → "支持了 288 個專案" (parse the first number)
- location: `.profile_bio .location a` → "Sheridan, WY"
- joined: `.profile_bio .joined time[datetime]` → "2023-09-08T18:09:36-04:00"
- created total: sub-nav link `a[href*="/created"]` text "已發起 13" / "Created 46" (extract number; locale-independent)

### Bio + website (on /about)

Content container `.grid-col-12.grid-col-10-sm.grid-col-8-md.grid-col-center` holds `div.grid-row.pt3` rows. The row whose `h5` matches 履歷/傳記/Biography holds the bio `<p>` in its sibling cell. The row whose `h5` matches 網站/Website holds `a[target="_blank"]` (website href). Fallback website selector: `.menu-submenu a[target='_blank']`. Verified on baroque and sjgames.

### Created projects (on /created)

`DIV[data-projects]` (id `react-profile-project-cards`, data-ref `profile_created`) holds an HTML-escaped JSON array. `getAttribute("data-projects")` may still contain `&quot;`/`&amp;`; unescape before JSON.parse. Project fields: id, name, slug, state, percent_funded, deadline, state_changed_at, created_at, launched_at, backers_count, static_usd_rate, usd_pledged, converted_pledged_amount, pledged, goal, currency, creator{id,name,slug,avatar,urls}, location, category, video, profile, spotlight, is_launched, prelaunch_activated, urls.web.project.

Sample project:
```json
{"id":969156727,"name":"Wit & Wisdom: The Jane Austen Tarot","slug":"jane-austen-tarot","state":"successful","percent_funded":1062.74,"deadline":1787072557,"launched_at":1785258157,"pledged":53137,"goal":5000,"currency":"USD","backers_count":683,"url":"https://www.kickstarter.com/projects/baroque/jane-austen-tarot"}
```

State values observed: `successful`, `submitted`, `started`. Upcoming/pre-launch projects (state `started`/`submitted`) have `percent_funded: 0` (NOT null), `deadline: 0`, `pledged: 0`, `goal: 0`, `is_launched: false`.

### Pagination

Page size 32. `?page=N` navigates to later pages (verified: sjgames total 46 → page1 32, page2 14, page3 empty). A page past the last has no `[data-projects]` element and shows the empty message "未發起專案" ("has not launched any projects"). Scrolling does NOT lazy-load more; only the `?page=N` param works.

### /graph notes (verified, but NOT the data source)

POST https://www.kickstarter.com/graph with `Content-Type: application/json` + `X-CSRF-Token` + same-origin cookie returns 200; missing token or cookie → 403. Body is an Apollo array: `[{"operationName":"...","variables":{},"query":"..."}]`. Root fields `me`, `rootCategories`, `project(slug:)`, `projects(first:)` exist; there is NO user/profile/search root field. `project(slug:).creator` exposes id/name/biography/location{displayableName}. Creator profile data does NOT come via /graph on the web app — it is server-rendered into `data-projects` + DOM. The command therefore uses the SSR path.

## Failure Signals

- Invalid creator: title "The page you were looking for doesn't exist (404)", body "Back it up! We can't find this page...". Check NOT_FOUND before platform-block checks.
- Cloudflare / platform blocking: HTTP 403/429, or body matches /cloudflare|just a moment|security verification|captcha|正在进行安全验证|请完成安全验证/. A browser session normally avoids this, but keep the check as a fallback.
- Empty created page (pagination exhausted): no `[data-projects]` element; body contains "未發起專案".
- Upcoming/pre-launch projects: `percent_funded: 0`, `deadline: 0`, `is_launched: false` — do not treat as missing data.

## Capture Assessment

The path is fully verified first-hand: browser `page.goto` to `/profile/{slug}/about` (header + bio + website) and `/profile/{slug}/created` (projects via `data-projects`, paginated 32/page via `?page=N`). It is parameterizable by creator slug, covers happy path, URL-form input, pagination beyond 32 projects, invalid creators, and platform-block fallback. This is a reusable, valuable command that complements `kickstarter/search` (search finds projects; get-creator returns a creator's profile + launched projects). Capture as `kickstarter/get-creator`.
