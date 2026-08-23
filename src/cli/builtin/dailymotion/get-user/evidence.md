# Evidence: dailymotion/get-user

This document records the research and validation evidence for the `dailymotion/get-user` command.

## Exploration Path

`websculpt command list dailymotion` returned a single existing command, `dailymotion/search` (browser, DOM cards use `[data-testid="video-card"]`). No user-profile command existed. The relevant WebSculpt runtime contracts were consulted. Exploration used an isolated Playwright session (`<session>`, own tab, verified ownership) against the user's Chrome plus direct node calls to the public API.

## Verified URLs

- `https://www.dailymotion.com/user/beinsports-hk` — profile page (header: screenname/@username/avatar/verified badge/follow button; video grid default "最新动态" ordering)
- `https://www.dailymotion.com/user/beinsports-hk/videos` — videos sub-page (same content as root; sort dropdown 最新动态/观看最多的)
- `https://www.dailymotion.com/user/beinsports-hk/videos?sort=visited` — most-viewed ordering (first card "Klopp determined to 'solve' Liverpool's problems", 4年前)
- `https://www.dailymotion.com/user/beinsports-hk/feed` — same content as /videos (verified first 15 video ids identical)
- `https://www.dailymotion.com/user/beinsports-hk/playlists` — playlists sub-page (featured non-empty playlists only; beIN shows 1 card "Shorts-ASIA" xa5jms)
- `https://www.dailymotion.com/playlist/xa5jms` / `https://www.dailymotion.com/playlist/xa60ak` — playlist pages (xa60ak is empty: "目前的播放列表为空")
- `https://www.dailymotion.com/user/usaitshop_823` — user with a description (header description element verified)
- `https://www.dailymotion.com/user/thisuserdoesnotexist12345` — non-existent user (title "Not Found", no channel header)
- `https://www.dailymotion.com/user/x1vy1cl` — ID-form URL returns "Not Found" on the site; must resolve to a username first
- `https://api.dailymotion.com/user/beinsports-hk` and `/user/x1vy1cl` — user API resolves both ID and username forms; returns counts the DOM does not show; 404 for non-existent users
- `https://api.dailymotion.com/user/x1vy1cl/videos` — video list API (sort=recent ordering differs from the site)
- `https://api.dailymotion.com/user/x1vy1cl/playlists` — playlist list API (total=30 while the profile displays only 1)

## Structural Evidence

The current Dailymotion profile UI (neon-ssr, Chinese locale) has two tabs — 视频 (`[data-testid="videos-tab-id"]` → `/user/{username}/videos`) and 播放列表 (`[data-testid="playlists-tab-id"]` → `/user/{username}/playlists`). "最新动态" is the sort dropdown label (`[data-testid="sort-dropdown-button-id"]`), not a tab; its options are 最新动态 (default, no URL param) and 观看最多的 (`?sort=visited`). Root `/user/{u}`, `/user/{u}/feed`, and `/user/{u}/videos` render the same video grid.

Header DOM (container `[data-testid="channel-header-testid"]`): screenname `h1[class*="ChannelHeaderInfo__channelDisplayName"]`, @username `[class*="ChannelHeaderInfo__channelName"] span`, avatar `[class*="ChannelHeader__channelAvatar"] img`, description `[class*="ChannelHeaderDescription__description"]` (full text in its `title` attribute), verified badge `[data-testid="channel-badge-id"]`, follow button `[data-testid="follow-button"]`. The header DOM does NOT display follower/video counts (beIN has no stat container; usaitshop has an empty one) — counts come from the API.

Video card: `[data-testid="video-card"]` (class contains `VideoCard__videoCard`). CSS-module class names carry hash suffixes, so selectors must use `[class*=prefix]`. Fields: id from `a[href^="/video/"]`, title from `[class*="VideoCard__videoTitle"]` `title` attribute, duration from `[class*="PlayingIndicatorTag__videoDuration"]`, publish from `[class*="PubDate__videoPubDate"]` (title = localized absolute time, text = relative), thumbnail from `img` (lazy-rendered on scroll). Infinite scroll: 30 initial cards, grows to 90+ after scrolling.

Playlist card: same `[data-testid="video-card"]` container with `a[href^="/playlist/"]`; name from `[class*="VideoCard__videoTitle"]`, video count from `[class*="VideoCard__playlistIconContainer"] span`, publish from `[class*="PubDate__videoPubDate"]`. The profile shows only non-empty/featured playlists (beIN: API playlists_total=30 but the profile displays 1, the other 29 are empty pages).

Public API `api.dailymotion.com/user/{id-or-username}?fields=...` returns header data (id, screenname, username, avatar_240_url, description, followers_total, following_total, videos_total, playlists_total, views_total, created_time, country, verified, url) and resolves both ID and username forms. Node global fetch (undici) returns 200. Field whitelist is strict — unknown fields cause a 400. Non-existent user → HTTP 404 `type: not_found`.

Site ordering (最新动态: xaymbge,xaykl06,xayjhpu,xayh2li,...) differs from API `sort=recent` (xaymbge,xaym816,xaym1nu,xaylyqy,...), so the browser is required to reproduce the profile's video list.

## Failure Signals

- Non-existent user: API 404 (type not_found) → command throws NOT_FOUND before navigation; browser page title becomes "Not Found" with no channel header.
- ID-form URL on the site returns "Not Found" — the command must resolve the user to a username via the API before navigating.
- Empty / exhausted streams: no new `[data-testid="video-card"]` cards after scrolling with no scroll-height growth → stop and mark `partial: true`.
- Lazy thumbnails: cards below the fold may lack an `<img>` until scrolled into view; extraction falls back to `null` thumbnail.
- Structure drift: missing channel header or missing card container after a successful API resolve → DRIFT_DETECTED.
- Polite pacing: randomized waits (200-700ms) and light pointer/scroll nudges; no CAPTCHA/403/429 observed during exploration.

## Capture Assessment

Capture eligible: yes. The path is parameterizable (user/tab/sort/limit), publicly accessible (no login required), and browser-based because the profile's video ordering and featured-playlist display differ from the public API. Header counts come from the public API (Node fetch), lists come from the browser DOM. The dual-form user input (ID or username) is resolved by the API before navigation.
