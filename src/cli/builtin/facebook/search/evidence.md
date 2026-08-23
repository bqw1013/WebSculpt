# Evidence: facebook/search

This document records the research and validation evidence for the `facebook/search` command.

## Exploration Path

Checked `websculpt command list facebook`; no existing Facebook command. Read the explore, capture, and maintain skills, the browser runtime contract, and the platform interface documentation before implementation.

## Verified URLs

- https://www.facebook.com/search/top?q=artificial%20intelligence
- https://www.facebook.com/search/pages/?q=artificial%20intelligence
- https://www.facebook.com/search/groups/?q=artificial%20intelligence
- https://www.facebook.com/search/people/?q=artificial%20intelligence
- https://www.facebook.com/search/videos/?q=artificial%20intelligence
- https://www.facebook.com/search/events/?q=technology%20conference

## Structural Evidence

The page contains JSON script payloads that parse with `JSON.parse`; recursively locating `serpResponse.results.edges` yields native search edges. The browser network also returns `SearchCometResultsPaginatedResultsQuery` 200 responses. `pages`, `groups`, and `people` return `ENTITY_PAGES`, `ENTITY_GROUPS`, and `ENTITY_USER` profile edges with `id`, `profile_url`, `url`, `name`, `profile_picture`, snippets and CTA fields. `top` also returns `SearchRichPostRenderingStrategy` stories with feedback, attachments and `creation_time`. `videos` returns `SearchNativeVideoViewModel` edges (role `VIDEOS`) with `video_metadata_model` (`video.id`, `title`, `save_description`, `video_owner_profile`, `relative_time_string`), `video_thumbnail_model` (`thumbnail_image.uri`, `video_duration_text`), and `video_click_model.click_metadata_model.payload.open_video_uri` (`/watch/?ref=search&v={id}&external_log_id=...&q=...`). `events` returns `SearchProfileViewModel` edges (role `ENTITY_EVENTS`) whose `profile.__typename` is `Event` with `url` of form `https://www.facebook.com/events/{id}/`. `page_info.has_next_page` is present for all six types. DOM fallback uses `[role="feed"] [role="article"]` only after re-navigation.

## Failure Signals

The command depends on a logged-in Facebook browser session. Missing session, challenge, 403, or 429 must surface as `AUTH_REQUIRED`/`DRIFT_DETECTED`; no CAPTCHA or login-wall bypass is attempted. Empty page-data is a valid empty result and does not trigger fallback. API/page-data and DOM failure together throw `DRIFT_DETECTED`. Request bodies are not read or replayed because they contain session-bound credentials.

## Capture Assessment

Capture is appropriate: the same browser navigation and native page-data shape was verified for four parameterized search types, with complete native envelopes and a bounded DOM fallback.
