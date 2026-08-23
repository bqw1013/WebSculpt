# Evidence: vimeo/get-user

This document records the research and validation evidence for the `vimeo/get-user` command.

## Exploration Path

- explore workspace `<explore-workspace>` passed `websculpt explore assess` (status: passed, capture eligible: yes).
- Browser automation guide consulted. Browser exploration used playwright-cli attach session `<session>`.
- Library check: `websculpt command list vimeo` shows one command `vimeo/search` (browser, no login). No existing user-profile command; `vimeo/get-user` is new. `vimeo/search` `identity()` for `people` type (location_details, metadata.public_videos, metadata.connections.followers, pictures, skills, background_video) was used as a field reference.
- Runtime determination (recorded in explore trace section E): node direct fetch of the profile homepage and every sub-page returns 200 with no rate limiting (homepage 8/8, sub-pages 7/7, no 429/403/Cloudflare challenge), but the SSR HTML lacks the header `location`, `followingCount`, `verified`, `membership`, `websites`, `contact_emails` fields. Those are only available from the browser-side fetch `api.vimeo.com/users/{user}?fields=...&fetch_user_profile=1` (anonymous node call to `api.vimeo.com/users/*` returns 401 error_code 8003). Therefore runtime = browser.

## Verified URLs

- https://vimeo.com/<user-slug> — profile homepage (Next.js). Header: name "<display name>", bio, portrait, Followers <count>, Following <count>, Collections <count>, Member since Jan 2013, <count> videos. The "Showcases" tab in the header links to /albums.
- https://vimeo.com/<user-slug>/videos — videos sub-page (legacy SSR). 12 cards/page, pages 1-<count>, sort date|alphabetical|plays|likes|duration, format thumbnail|detail.
- https://vimeo.com/<user-slug>/videos/page:2/sort:date — path-style pagination verified.
- https://vimeo.com/<user-slug>/albums — albums sub-page (page title "Showcases on Vimeo"), album card /showcase/<showcase-id> "<showcase name>", "<count> Videos / 13:32".
- https://vimeo.com/<user-slug>/collections — collections aggregate page: sections "<count> Showcase" + "<count> Channel" (channel card /channels/<channel-id> "<channel name>", "<count> Videos / <count> Followers").
- https://vimeo.com/<user-slug>/following — following list, <count> users, user cards (`<follower-slug-no-vanity>`, `<follower-slug>`).
- https://vimeo.com/<user-slug>/following/followers/sort:date — followers list, 25 cards/page, pages 1-<count> (<count> followers).
- https://vimeo.com/thisuserdoesnotexist12345xyz — nonexistent user returns HTTP 404, `__NEXT_DATA__.props.pageProps.profileMeta = null` (edge case).
- https://api.vimeo.com/users/<user-slug>?fields=...&fetch_user_profile=1 — browser-side header data source (200 in page; 401 from node without session credentials).
- https://api.vimeo.com/users/<user-id>/profile_sections/default/videos?...page=1&per_page=12 — homepage video grid source.

## Structural Evidence

### Header (from browser page fetch of `api.vimeo.com/users/{user}?fields=...&fetch_user_profile=1`)
Response fields (verified on /users/<user-slug>):
```json
{ "uri": "/users/<user-id>", "name": "<display name>", "link": "https://vimeo.com/<user-slug>",
  "bio": "<bio text>", "created_time": "2013-01-11T19:26:54+00:00",
  "membership": {"type":"basic","display":"Basic"},
  "pictures": { "base_link": "https://i.vimeocdn.com/portrait/6204770?sig=...",
                "sizes": [ {"width":30,"height":30,"link":"..."}, ... {"width":360,"height":360,"link":"..."} ] },
  "metadata": { "connections": { "albums": {"total":<count>}, "followers": {"total":<count>},
                 "following": {"total":<count>}, "videos": {"total":<count>},
                 "vimeo_experts": {"is_enrolled":false} },
                "public_videos": {"total":<count>} },
  "location_details": { "formatted_address":"", "city":null, "state":null, "country":null },
  "total_collection_count": <count>, "contact_emails": {"emails":["<email>"]},
  "websites": [], "verified": ..., "is_expert": false, "profile_discovery": true, "background_video": ... }
```
- waitForResponse matcher: URL starts with `api.vimeo.com/users/{slug}?` and contains `fetch_user_profile=1`.
- `location` is optional: for <user-slug> it is `""` (formatted_address empty; "Bay Area" only appears inside bio text).
- Node SSR alternative (`__NEXT_DATA__.props.pageProps.profileMeta.crawlable`): name/pageUrl/userId/portrait/rssTitle/hasPublicVideos + jsonLd (followers=interactionStatistic.userInteractionCount, videos=agentInteractionStatistic.userInteractionCount, description=bio, dateCreated). Missing location and followingCount.

### Sub-pages (all legacy SSR, list container `<ol class="js-browse_list ...">`, path-style pagination `/<user-slug>/{tab}/page:N/sort:X`)
- /videos: `<li id="clip_{id}" data-position="N">` → `<a href="/{id}" title="{title}">` → `img.thumbnail` (src) + `.data .iris_video-vital__title .l-ellipsis` (title) + `.meta time[datetime]` (upload date ISO). 12 cards/page. `format:detail` adds `.data .duration` ("03:18"). Sidebar `super_link_list_title`: [<count> Videos→/videos, <count> Likes→/likes, <count> Collections→/collections, <count> Following→/following].
- /albums: `<li class="collection_thumbnail">` → `.thumbnail_wrapper` → `<a href="/showcase/{id}" title="{name}">` → `img.thumbnail` + `.overlay .overlay_thumbnail_meta .banner` (name) + `.meta` ("<count> Videos / 13:32" = N videos + total duration). Page title is "Showcases on Vimeo".
- /collections: aggregate page with `collections_section` blocks; each has an `<ol class="js-browse_list ...">`. Section heading e.g. "<count> Showcase" / "<count> Channel". Showcase cards are the /albums card shape (`href="/showcase/{id}"`); channel cards are `<li class="collection_thumbnail" id="channel_{id}">` → `<a href="/channels/{id}" title="{name}">` → `.banner` (name) + `.meta` ("<count> Videos / <count> Followers"). collectionCount = total_collection_count (showcases + channels).
- /following and /following/followers: `<li id="user_{id}" data-position="N">` → `<a href="/{slug}" title="{name}">` → `img.portrait` (avatar) + `.data .title` (name) + `.meta time[datetime]` (follow date). Followers 25 cards/page (<count> → pages 1-<count>). slug is `<follower-slug-no-vanity>` when no vanity name, `<follower-slug>` when vanity.

## Failure Signals

- Nonexistent user: HTTP 404, `profileMeta` null → throw `NOT_FOUND`.
- Header API not fired: if waitForResponse for `fetch_user_profile=1` times out, throw `DRIFT_DETECTED` (page structure change).
- Anonymous node call to `api.vimeo.com/users/*` → 401 error_code 8003 (requires browser session; not used by the command).
- Sub-page list empty / no `ol.js-browse_list` → throw `DRIFT_DETECTED` or `EMPTY_RESULT`.
- Node SSR homepage is reachable without rate limiting (8/8 + 7/7 all 200), but the browser session is still required for the full header.
- Browser polite pacing: use random waits (randomWait 240-560ms between page loads) and light mouse/scroll humanization (lightHumanize). No Cloudflare challenge observed during exploration.

## Capture Assessment

This command should be captured. The verified path (header via browser page-internal `api.vimeo.com/users/{user}?fields=...&fetch_user_profile=1`, sub-page lists via `ol.js-browse_list` DOM with path-style `/page:N` pagination) is stable, reusable, and parameterizable (`user` slug + `tab` + `limit`). It is the natural follow-up from video pages ("click uploader name") and from `vimeo/search --type people`. It fills the gap in the Vimeo command family (currently only `vimeo/search`). Public profiles need no login; browser runtime required because header location/followingCount/verified etc. are not in the SSR HTML.
