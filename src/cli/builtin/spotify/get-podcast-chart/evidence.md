# Evidence: spotify/get-podcast-chart

This document records the research and validation evidence for the `spotify/get-podcast-chart` command.

## Exploration Path

Independently verified on 2026-08-20 (websculpt daemon, attached Chrome with a logged-in Spotify account). Checked the command library first: `websculpt command list spotify` returns no commands (no spotify domain at all; only an unrelated techcrunch/list-podcast-episodes hit). Consulted the shared browser-automation protocol and the shared Spotify command instructions. The command plan and the prior comprehensive explore trace were used as reference only — every fact below was re-verified live in a browser session.

Node-side anonymous access was re-checked as independent evidence for the browser runtime:
- `GET https://open.spotify.com/get_access_token?reason=transport&productType=web_player` (Chrome UA) → 403 URL Blocked
- `GET https://open.spotify.com/api/token` (Chrome UA) → 400 Unauthorized; also 400 after first planting landing cookies (sp_new/sp_landing/sp_t)
- `POST https://api-partner.spotify.com/pathfinder/v2/query` (queryShowMetadataV2, fake persisted hash) → 401
- `GET https://open.spotify.com/oembed?url=https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk` → 200 (anonymous oEmbed works)

Conclusion: pathfinder GraphQL cannot be called anonymously over HTTP; the command must run in a browser context and read the page's own in-page fetch.

## Verified URLs

- https://open.spotify.com/genre/0JQ5DAB3zgCauRwnvdEQjJ — 播客排行榜 (in-app podcast chart). In an ANONYMOUS browser context this page renders exactly 20 podcast show cards.
- https://api-partner.spotify.com/pathfinder/v2/query — the GraphQL endpoint the page uses for the chart (operations `browsePage` and `browseSection`).
- https://open.spotify.com/oembed?url=https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk — anonymous oEmbed (200), used as a node-side sanity check.
- https://open.spotify.com/get_access_token and https://open.spotify.com/api/token — anonymous token endpoints, both blocked (403/400); documented as the reason browser context is required.

## Structural Evidence

The chart page is a plain SPA shell; all data comes from pathfinder GraphQL. Two operations drive the page:

- `browsePage` with variables `{ uri: "spotify:page:0JQ5DAB3zgCauRwnvdEQjJ" }` → returns `data.browse` (`BrowseSectionContainer`) with header (title "播客排行榜", backgroundImage) and `sections.items[]`.
- `browseSection` with variables `{ uri: "spotify:section:0JQ5DAob0LrW8pqFzVs4ut" }` → returns `data.browseSection.sectionItems.items[]` — the 20 show entries.

Item shape (each element of `sectionItems.items`):
```
{
  "content": {
    "__typename": "PodcastOrAudiobookResponseWrapper",
    "data": {
      "__typename": "Podcast",
      "name": "The Joe Rogan Experience",
      "publisher": { "name": "Joe Rogan" },
      "coverArt": { "sources": [ {height:64,url}, {height:300,url}, {height:640,url} ] },
      "uri": "spotify:show:4rOoJ6Egrf8K2IrywzwOMk",
      "mediaType": "MIXED" | "AUDIO"
    }
  },
  "uri": "spotify:show:4rOoJ6Egrf8K2IrywzwOMk"
}
```

Verified sample (first entries, anonymous context): Spotify Live / Spotify; The Joe Rogan Experience / Joe Rogan; Crime Junkie / Audiochuck; The Shawn Ryan Show / Shawn Ryan Show; Good Hang with Amy Poehler / The Ringer; The Tucker Carlson Show / Tucker Carlson Network; This Past Weekend w/ Theo Von / Theo Von; The Daily / The New York Times; ... exactly 20 in `a[href*="/show/"]` links.

Key facts:
- rank = ARRAY POSITION + 1 (no explicit rank field anywhere in the response or DOM).
- No pagination: `sectionItems.pagingInfo.nextOffset` is null; the section has exactly 20 items. No "show all" link, no filters, no episode chart → command takes no parameters.
- Cover: pick the largest source (640px) from `coverArt.sources`.

CRITICAL login-state finding: in the attached logged-in context (free account, HK market) the SAME page returns `sectionItems.items: []` and `totalCount: 0` — the chart is EMPTY, and the DOM main area has no show cards. In a freshly created anonymous context (`browser.newContext()`, no cookies) the page returns the full 20-item chart. Therefore the command MUST read the chart through an anonymous context.

## Failure Signals

- Logged-in / account-market emptiness: a logged-in account in some markets gets an empty chart (`items: []`, `totalCount: 0`). The command avoids this by always using a fresh anonymous context; if the anonymous context still returns 0 items, return `{ entries: [] }` rather than crashing.
- Missing browse response: if neither `browsePage` nor `browseSection` is captured (e.g. the SPA didn't boot, a login wall appeared, or the page structure changed), fall back to DOM parsing of `a[href*="/show/"]`.
- DOM fallback drift: card DOM structure is best-effort (title line / publisher line split); if even DOM yields nothing, the command returns `{ entries: [] }`. A structural change would show up as all-empty id/title and should be treated as DRIFT_DETECTED in a future maintain pass.
- Network dependency: an anonymous context still needs to reach open.spotify.com and complete the SPA's clienttoken bootstrap before pathfinder calls fire; wait for the browse response with a generous timeout (8s) before parsing.
- Polite pacing: single page load per run, no repeated navigation, natural waits; per shared instructions keep total run time bounded (~10s) and avoid hammering.

## Capture Assessment

Capture this command. It is the only anonymous in-app Spotify podcast chart (the standalone charts.spotify.com site requires login and is explicitly out of scope). It is the highest-frequency discovery surface for the Spotify podcast family: the returned show ids/urls feed spotify/get-podcast. It has a fixed 20-item output, no parameters, no pagination, and a verified single-page GraphQL path — simple to implement and to maintain. The anonymous-context requirement is unusual and must be preserved in the implementation, hence this evidence record.
