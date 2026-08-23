# Context

## Precipitation Background (Why This Command Exists)

Dailymotion playlists are an organization form for series content (sports compilations, show episodes). The command library already had `dailymotion/search --type playlist` (returns playlist cards) but no way to expand a single playlist's contents. This command fills that gap: given a playlist URL/ID it returns the playlist metadata plus the videos in playlist order. It is the downstream of `search --type playlist` and `get-user --tab playlists`.

## Value Assessment

- Reusable: any playlist URL or ID works (parameterizable `url` + `limit`).
- Node runtime — fast, no login/browser needed.
- Explore verified: 27 API calls with zero 429/403, and API info strictly superset of the website page.
- Playlist discovery chain: search --type playlist / get-user --tab playlists → get-playlist.

## Page Structure

- Website page: `https://www.dailymotion.com/playlist/{id}` (SPA; the static HTML is an empty shell — the content renders via JS/GraphQL).
- Command uses the public REST API instead of the SPA:
  - Metadata: `GET https://api.dailymotion.com/playlist/{id}?fields=id,name,description,videos_total,thumbnail_720_url,created_time,updated_time,private,owner.id,owner.screenname,owner.username,owner.url`
  - Videos: `GET https://api.dailymotion.com/playlist/{id}/videos?fields=id,title,url,duration,thumbnail_url,created_time,views_total,owner.screenname,owner.username,owner.url&limit={n}&page={n}`
- Response shape: metadata is a flat JSON object with dot-keys (`owner.screenname`, etc.); videos is `{page, limit, explicit, has_more, list:[...]}`.

## Environment Dependencies

- No login, no browser. Public API only.
- Network: requires access to `api.dailymotion.com`.
- Polite pacing: the command sleeps a random 200-700ms before every HTTP request and never pages faster than one request per sleep — do not remove this. Transient network errors, 5xx responses and invalid JSON are retried up to twice with a 1000-1500ms backoff (definitive statuses 404/400/429/403 are never retried).

## Failure Signals

- HTTP 404 from either endpoint → playlist does not exist → `NOT_FOUND`.
- HTTP 400 with "Unrecognized value" → API field drift (a field in `PLAYLIST_FIELDS`/`VIDEO_FIELDS` was renamed/removed) → `DRIFT_DETECTED`. Check the allowed fields in the error message and update the field lists.
- HTTP 429/403 → Dailymotion started rate limiting → `RATE_LIMITED`; slow down further.
- Empty `list` + `has_more:false` before limit → normal for short playlists; `partial: true`.

## Repair Clues

- The API's own 400 error message lists the complete allowed field set — use it to repair `PLAYLIST_FIELDS`/`VIDEO_FIELDS` if drift occurs.
- If `api.dailymotion.com` ever starts requiring auth, the website page's `__RUNTIME_CONFIG__.API_ENDPOINT` points to a GraphQL endpoint (`api.dailymotion.com/v1/graphql`), a possible fallback — but that is an unverified path and should be re-explored.
