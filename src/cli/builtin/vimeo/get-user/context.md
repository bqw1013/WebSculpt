# Context

## Precipitation Background (Why This Command Exists)

Vimeo command family needed a natural follow-up from video pages and `vimeo/search --type people`: clicking an uploader name should let a caller pull the creator's profile header plus one of their content/follower sub-pages. Explored in an explore workspace (assess passed 2026-08-18), verified against `vimeo.com/<user-slug>`.

## Value Assessment

- Reusable: any Vimeo public user slug; three parameters (`user`, `tab`, `limit`) cover the five sub-pages with one code path.
- High frequency: profile inspection is a core need when researching creators; complements `vimeo/search` (people cards are thin) and `vimeo/get-video` (video page only exposes the uploader name).
- Saves time: header + a full sub-page with internal pagination in one call, no manual browser paging.

## Page Structure

- Header source: browser page-internal fetch `api.vimeo.com/users/{user}?fields=...&fetch_user_profile=1`. waitForResponse matcher = `url.includes("api.vimeo.com/users/") && url.includes("fetch_user_profile=1")`. Response fields: name/link/bio/created_time/pictures.sizes/metadata.connections.{albums,followers,following,videos}.total/metadata.public_videos.total/location_details.formatted_address/total_collection_count/verified/websites/membership.type.
- Sub-pages are legacy SSR (not Next.js), list container `<ol class="js-browse_list ...">`:
  - `/videos` — `li[id^=clip_]`; 12/page; pagination `/<user-slug>/videos/page:N/sort:date`; `format:detail` adds `.duration`.
  - `/albums` — `li.collection_thumbnail a[href^=/showcase/]`; page title is "Showcases on Vimeo"; meta "N Videos / M:SS".
  - `/collections` — aggregate: `section.collections_section` with showcase + channel cards; channel cards `li.collection_thumbnail[id^=channel_] a[href^=/channels/]`; meta "N Videos / M Followers".
  - `/following` — `li[id^=user_]`; user cards.
  - `/following/followers/sort:date` — same user cards; 25/page; <count> followers → pages 1-<count>.
- Pagination is path-style; extracted by scanning `a[href]` matching basePath + `/page:(\d+)/`, then following the smallest unseen next page.
- IMPORTANT format variation: sub-pages serve `format:thumbnail` or `format:detail` depending on the browser session's preference/cookies. The two formats use different card DOM:
  - videos thumbnail: `a[title]` / `.l-ellipsis` + `.meta time`; videos detail: `.data .title a` + `.duration`.
  - albums/collections thumbnail: `li.collection_thumbnail` + `a[title]`/`.banner` + `.overlay .meta`; detail: plain `li` + `.data .title a` + `.count .videos` + `.duration`.
  - Detail-format album/channel cards contain MALFORMED nested `<a>` wrappers (an empty `<a>` precedes the real one inside `.title`). The empty `<a>` has `textContent = "\n "` (truthy whitespace), which used to block the `.title` fallback. Name extraction must normalize (`clean`) each candidate and only accept non-empty trimmed values, trying `a[title] → .banner → .data .title a → .data .title` in order. Do not rely on any single format.

## Environment Dependencies

- Browser runtime required (Chrome/Edge with remote debugging). Public profiles need no login.
- Header fields location/followingCount/verified/membership are NOT in the SSR HTML — do not attempt node fallback; anonymous `api.vimeo.com/users/*` returns 401.
- Polite pacing: `randomWait` 240-560ms between page loads + `lightHumanize` (light mouse move/wheel). No Cloudflare challenge observed in exploration (15 consecutive node calls all 200), but keep pacing.
- The sub-page tab URL for a nonexistent user or a user without a given tab still renders (empty browse list); the NOT_FOUND check is on the header API (HTTP 404).

## Failure Signals

- Header API waitForResponse timeout → page structure changed → `DRIFT_DETECTED`.
- Header API or main navigation returns 404 → `NOT_FOUND`.
- `ol.js-browse_list` missing on a sub-page → returns empty items (partial=true), not an error, so an empty creator still works.
- Node SSR no longer has the header API (401) — never rely on it for location/followingCount.

## Repair Clues

- If Vimeo changes the header endpoint, look for the new `api.vimeo.com/users/*` request fired on `vimeo.com/{user}` (fields param includes `fetch_user_profile=1`); update `isHeaderResponse`.
- If a sub-page layout changes, re-verify `ol.js-browse_list` item classes (`clip_`, `user_`, `collection_thumbnail`) against the explore trace; the `.banner`/`.meta` overlay shape is shared by albums/channels.
- Alternative header source: `__NEXT_DATA__.props.pageProps.profileMeta.crawlable` (name/portrait/bio/followers via jsonLd) — partial only (no location/followingCount), not a full replacement.
