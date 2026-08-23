# Context

## Precipitation Background (Why This Command Exists)

The Dailymotion command family was planned for WebSculpt because the platform had no commands. `dailymotion/get-user` covers the uploader-profile need (header profile + videos/playlists sub-pages) as a browser route: the site's video ordering and featured-playlist display differ from the public API, and the "最新动态" feed view has no API equivalent.

## Value Assessment

One command returns a full uploader profile (header counts from the public API) plus a live sub-page list, avoiding repeated manual browsing. It feeds the rest of the family: `dailymotion/get-playlist` consumes playlist IDs from `--tab playlists`; `dailymotion/search --type user` discovers users. Header counts (followers/videos/playlists/views) are not shown on the page DOM, so the API merge adds real value.

## Page Structure

- Profile base: `https://www.dailymotion.com/user/{username}`. Tabs: 视频 → `/user/{u}/videos`, 播放列表 → `/user/{u}/playlists`. Root, `/feed`, and `/videos` render the same video grid. Sort dropdown 最新动态 (default) / 观看最多的 (`?sort=visited`).
- Header container `[data-testid="channel-header-testid"]`; screenname `h1[class*="ChannelHeaderInfo__channelDisplayName"]`; @username `[class*="ChannelHeaderInfo__channelName"] span`; avatar `[class*="ChannelHeader__channelAvatar"] img`; description `[class*="ChannelHeaderDescription__description"]` (full text in `title`); verified badge `[data-testid="channel-badge-id"]`; follow button `[data-testid="follow-button"]`.
- Cards: `[data-testid="video-card"]` for both video (`a[href^="/video/"]`) and playlist (`a[href^="/playlist/"]`) cards. CSS-module class names carry hash suffixes, so selectors use `[class*=prefix]`. Video fields: `[class*="VideoCard__videoTitle"]` (title attr), `[class*="PlayingIndicatorTag__videoDuration"]`, `[class*="PubDate__videoPubDate"]` (title = localized absolute, text = relative), `img` thumbnail (lazy-rendered on scroll). Playlist count: `[class*="VideoCard__playlistIconContainer"] span`.
- Thumbnails: Dailymotion lazy-renders `img` only when a card enters the viewport and REMOVES `img` for cards scrolled far out of view, so a card's image can only be read while it is in/near the viewport. `completeThumbnails` processes any null-thumbnail items from deepest to shallowest, centering each in the viewport (which triggers its image) and batch re-extracting; existing thumbnails are never overwritten. A genuinely thumbnail-less card stays null.
- Public API: `GET https://api.dailymotion.com/user/{id-or-username}?fields=id,screenname,username,avatar_240_url,description,followers_total,following_total,videos_total,playlists_total,views_total,created_time,country,verified`. Node global fetch works (200, undici). Strict field whitelist — unknown fields cause a 400.

## Environment Dependencies

Requires Chrome or Edge running with remote debugging enabled (browser runtime). Public pages need no login; login is recommended for the localized/personalized experience. Polite pacing: the command randomizes waits (200-700ms) and applies light pointer/scroll nudges before each extraction. One API call per execution (resolution + header) plus serial scrolling; no rate limiting observed during exploration.

## Failure Signals

- API 404 (type not_found) → `NOT_FOUND` before navigation.
- Browser "Not Found" (title) or missing channel header after a successful API resolve → `NOT_FOUND`.
- No new cards after scrolling with no scroll-height growth → stop, `partial: true`.
- Missing card container or header → `DRIFT_DETECTED` (thrown when the expected structure is absent after a valid user resolve).
- Lazy thumbnails: cards below the fold have no `img` until scrolled into view, and out-of-view cards have their `img` recycled (removed). The command centers missing cards to trigger loading; a card whose image genuinely never resolves stays `null`. Thumbnail retrieval adds a few seconds of scrolling for larger limits.

## Repair Clues

- If the CSS-module class prefixes change, update the `[class*=prefix]` selectors in the two page extractors (`extractVideos`, `extractPlaylists`); the `[data-testid="video-card"]` container and `/video/` + `/playlist/` link anchors are the primary anchors.
- If the profile tab structure changes, re-check the tab hrefs (`/user/{u}/videos`, `/user/{u}/playlists`) and the sort URL mapping (`?sort=visited`).
- If the user API endpoint changes, the resolution + header merge in `resolveUser`/`mapUser` is the single point to update; the field whitelist is strict, so validate `fields=` against the API docs.
