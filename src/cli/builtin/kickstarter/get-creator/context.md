# Context

## Precipitation Background (Why This Command Exists)

Captured 2026-08-20 after first-hand explore. Need: given a Kickstarter creator profile name or URL, return the creator's public profile (bio, location, join date, backed count) plus their launched projects with funding state and percent funded. Kickstarter has no public creator-profile REST endpoint usable without signing; the web pages are the reliable source.

Critical decision: **browser runtime**. node/curl are blocked by Cloudflare TLS fingerprinting (403 managed challenge, verified 5/5 for node and 403 for curl). Only a real browser session (websculpt daemon attach to the user's Chrome) can fetch the pages and receive the SSR payload.

## Value Assessment

Reusable, parameterizable (creator slug), high value: surfaces both the profile metadata and the full launched-projects list in one structured result. Complements `kickstarter/search` (which finds projects by query). Avoids re-parsing localized DOM text for every project — the `data-projects` attribute is a complete structured JSON payload.

## Page Structure

- Profile header (on `/profile/{slug}`, `/about`, `/created`):
  - `.profile_bio h2 a` — creator name
  - `.profile_bio .backed` — backed count text, e.g. "支持了 288 個專案" (parse first number)
  - `.profile_bio .location a` — location, e.g. "Sheridan, WY"
  - `.profile_bio .joined time[datetime]` — ISO join timestamp
  - `a[href*="/created"]` tab — text "已發起 13" / "Created 46" (extract number = created total)
- Bio + website (on `/profile/{slug}/about`): container `.grid-col-12.grid-col-10-sm.grid-col-8-md.grid-col-center`, `div.grid-row.pt3` rows; row whose `h5` matches 履歷/傳記/Biography → bio `<p>`; row whose `h5` matches 網站/Website → `a[target="_blank"]` (website). Fallback website: `.menu-submenu a[target='_blank']`.
- Created projects (on `/profile/{slug}/created`): `DIV[data-projects]` (id `react-profile-project-cards`) holds an HTML-escaped JSON array of projects. **Must unescape HTML entities** (`&quot;`→`"`, `&amp;`→`&`, etc.) before `JSON.parse` — try plain parse first, fall back to unescape+parse.
- Pagination: 32 projects per page. `?page=N` fetches later pages (verified: total 46 → page1 32, page2 14, page3 empty). Empty page = no `[data-projects]` element + body text "未發起專案". Scrolling does NOT lazy-load.

## Environment Dependencies

- Chrome/Edge running with remote debugging enabled (daemon `connectOverCDP`). First attach may show a system "allow remote debugging" popup.
- No login required; profile pages are public.
- Polite pacing: Kickstarter serves pages fine to a real browser, but keep gentle pacing — random 300–800ms waits between navigations; avoid burst navigation.
- Cloudflare may occasionally challenge even a browser; keep the `PLATFORM_BLOCKED` fallback and re-check with fresh navigation.

## Failure Signals

- **404 creator**: page title "The page you were looking for doesn't exist (404)", body "Back it up! We can't find this page...". Check this FIRST (before platform-block regex), otherwise the 404 body could be misread as a block. Maps to `NOT_FOUND`.
- **Platform blocking / rate limiting**: HTTP 403/429, or body matches `/cloudflare|just a moment|security verification|captcha|正在进行安全验证|请完成安全验证/`. Maps to `PLATFORM_BLOCKED`.
- **Upcoming projects** (state `started`/`submitted`): `percent_funded: 0`, `deadline: 0`, `is_launched: false`. Do NOT treat these zeros as missing/drift — they are Kickstarter's real values for pre-launch projects.
- **Empty created page** past the last: no `[data-projects]` element. This is the normal pagination end signal, not an error.

## Repair Clues

- If `.profile_bio` selector misses (name/location null) while the page loaded: the profile layout changed → check the `#profile_avatar` / `.NS_users__profile` wrapper for new class names, update `.profile_bio` selectors.
- If bio/website come back null but the about page loaded: the label text locale may differ (e.g. French/German). Widen the `h5` label regex, or switch to a structure-based extraction (first non-empty `<p>` in the label row).
- If `data-projects` is missing on page 1 for a known-valid creator: Kickstarter changed the payload (maybe moved to a different `data-*` attribute or a `/graph` query). Check `#react-profile-project-cards` and `[data-*]` attributes on the created page.
- If pagination stops short: re-verify page size (was 32) and the `?page=N` behavior; the created tab total (from `a[href*="/created"]`) is the authoritative count for early-stop.
- Alternative data path (verified but not used): `POST /graph` with `X-CSRF-Token` + cookie, query `project(slug:).creator` returns biography/location for a known project slug — usable as a fallback for bio/location if the about page breaks.
