# Context

## Precipitation Background (Why This Command Exists)

The platform needs a reusable public YouTube search command. The verified page route is YouTube's own `/results?search_query=...` page, whose `window.ytInitialData` contains structured search renderers. YouTube currently mixes legacy `videoRenderer`/`channelRenderer`/`movieRenderer` records with newer `lockupViewModel` records, especially for playlists, so the command keeps both native forms.

## Value Assessment

This path is reusable for ordinary YouTube search without an API key and avoids opening detail pages. Internal continuation pagination supports limits up to 100 while keeping requests serial and low-frequency. Native records let downstream normalization choose fields without losing platform-specific data.

## Page Structure

Search URL: `https://www.youtube.com/results?search_query=<encoded query>`. Verified filter encodings include video default (no `sp`), channel `EgIQAg==`, playlist `EgIQAw==`, upload-date day/week/month/year `EgIIAg==`/`EgIIAw==`/`EgIIBA==`/`EgIIBQ==`, popular video `CAM=`, popular channel `CAMSAhAC`, and popular playlist `CAMSAhAD`. The initial page exposes `window.ytInitialData`; the final section item is a `continuationItemRenderer`. Continuation POSTs use the page's own `ytcfg.get('INNERTUBE_CONTEXT')` and `INNERTUBE_API_KEY` against `/youtubei/v1/search`.

## Environment Dependencies

Browser runtime only. WebSculpt injects a page connected to the user's existing Chrome/Edge session; command code must not launch or attach a browser. Public search was verified without separate authentication. Ads and promotional lockups are interleaved and are ignored unless they have a recognized result renderer. Navigation waits 280-620ms, continuation waits 220-520ms, and return waits 0-450ms, all randomized. A single low-amplitude mouse move/scroll is used only in DOM fallback.

## Failure Signals

If navigation succeeds but `window.ytInitialData` is absent, its result tree lacks expected content, a continuation response is non-2xx/invalid JSON, or continuation schema drifts, the command records the failure and attempts DOM extraction. Valid empty page-data results are not treated as drift. DOM fallback requires a recognized video/channel/playlist anchor or renderer; otherwise it throws `DRIFT_DETECTED`. CAPTCHA/403/429 should be surfaced rather than bypassed by increasing request volume.

## Repair Clues

First inspect `window.ytInitialData` and the renderer key counts. If YouTube changes legacy result renderers, update `collectPage` for the new native type while preserving `native`. If continuation moves, inspect `continuationItemRenderer` and `appendContinuationItemsAction` again. If filters change, verify actual `sp` links from the filter dialog before changing mappings. Keep pagination serial and retain the random pacing ranges; never add detail-page fan-out.
