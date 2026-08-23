# Evidence: youtube/search

This document records the research and validation evidence for the `youtube/search` command.

## Exploration Path

Host-machine `websculpt command list` and `websculpt command list youtube` found no existing YouTube command. Existing search drafts were reviewed for strict limit validation, ignored standard parameters, browser pacing, continuation handling, and error codes. The explore and capture skills plus their runtime contracts were read. `playwright-cli 0.1.17` attached to the user's existing Chrome `default` CDP session. One self-created tab was used for YouTube and is closed after exploration.

## Verified URLs

* `https://www.youtube.com/results?search_query=artificial+intelligence`
* `https://www.youtube.com/results?search_query=artificial+intelligence&sp=EgIQAg%3D%3D` (channel search filter)
* `https://www.youtube.com/results?search_query=artificial+intelligence&sp=EgIQAw%3D%3D` (playlist search filter)
* `https://www.youtube.com/results?search_query=artificial+intelligence&sp=EgIIAg%3D%3D` (today/upload-date filter)
* `https://www.youtube.com/results?search_query=artificial+intelligence&sp=CAM%3D` (popular video sort)
* `https://www.youtube.com/results?search_query=artificial+intelligence&sp=CAMSAhAC` (popular channel sort; observed from the filter dialog)
* `https://www.youtube.com/results?search_query=artificial+intelligence&sp=CAMSAhAD` (popular playlist sort; observed from the filter dialog)

## Structural Evidence

`window.ytInitialData` was present after navigation and contained `responseContext`, `estimatedResults`, `contents`, `header`, and `topbar`. The default result tree contained `videoRenderer`, `movieRenderer`, and `channelRenderer` records. A sampled video (`qYNweeDHiyU`) exposed `videoId`, title runs, long/short byline and owner runs, published-time text, view-count text, duration, thumbnails, watch navigation endpoint, detailed metadata snippet, badges, and short view count. Channel filtering returned 20 `channelRenderer` records with `channelId`, title, canonical browse URL, description snippet, thumbnail, subscriber-count text, and video-count text.

Playlist filtering returned current `lockupViewModel` records with `contentType=LOCKUP_CONTENT_TYPE_PLAYLIST` or `LOCKUP_CONTENT_TYPE_PODCAST`, playlist `contentId`, `metadata.lockupMetadataViewModel.title.content`, metadata rows containing creator/type, sample video titles/durations, update text, and native playlist command URLs. The implementation preserves each renderer under `results[].native` and adds convenience fields only when directly available; missing likes/comments/published dates remain `null`.

The final search section contained `continuationItemRenderer.continuationEndpoint.continuationCommand.token`. A page-context POST to `/youtubei/v1/search?key=<ytcfg INNERTUBE_API_KEY>` with `{context:<ytcfg INNERTUBE_CONTEXT>, continuation:<token>}` returned HTTP 200 and additional result lockups plus another token. This is the verified internal pagination path; requests are serial.

Verified filter mappings: no `sp` for video/default relevance, `EgIQAg==` for channel, `EgIQAw==` for playlist, `EgIIAg==`/`EgIIAw==`/`EgIIBA==`/`EgIIBQ==` for day/week/month/year video upload dates, `CAM=` for popular video, `CAMSAhAC` for popular channel, and `CAMSAhAD` for popular playlist. The current UI did not expose a stable latest-sort URL; `sort=latest` is therefore ignored and reported.

## Failure Signals

No CAPTCHA, 403, or 429 occurred in the verified Chrome session. Ads were interleaved in the page data and are ignored because they lack recognized result renderers. The command treats missing initial page data, non-2xx/invalid continuation JSON, and missing expected result schema as page-data failure and attempts visible DOM extraction. Valid empty result data is not a failure. DOM fallback uses `ytd-video-renderer`/`ytd-channel-renderer`/`ytd-playlist-renderer` and stable result links, returns `partial:true`, and throws `DRIFT_DETECTED` only when both paths produce no records. Browser attach/daemon errors remain runner errors.

## Capture Assessment

`youtube/search` is eligible for capture. The path is parameterized by query, type, sort, time, and limit; preserves complete native result records; follows verified continuation pagination internally; requires no external key; and stays within the requested search-only scope. It intentionally does not implement detail pages, playback, subscriptions, playlist management, or other non-search operations.
