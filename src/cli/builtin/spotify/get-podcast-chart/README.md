# spotify/get-podcast-chart

Fetch Spotify's in-app podcast chart (播客排行榜) — the fixed top-20 ranked list of podcast shows that lives at `open.spotify.com/genre/0JQ5DAB3zgCauRwnvdEQjJ`, reached from the podcast hub's chart card. The standalone charts.spotify.com site requires login and is out of scope.

## Description

Returns the current top-20 podcast shows with their rank, show id, canonical URL, title, publisher, and 640px cover art. The chart is a single fixed list: no pagination, no filters, no episode chart, so the command takes no parameters. The command reads the page's own pathfinder GraphQL responses (`browsePage` / `browseSection`) inside a fresh anonymous incognito context that is opened and closed immediately (~1-2s), because a logged-in account in some markets gets an empty chart. No login required. A brief incognito window may flash while the command runs. The returned show ids/urls are the input for `spotify/get-podcast`.

## Parameters

None.

## Return Value

```
{
  "entries": [
    {
      "rank": 1,          // position on the chart, 1-20
      "id": "4rOoJ6Egrf8K2IrywzwOMk",   // 22-char show id
      "url": "https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk",
      "title": "The Joe Rogan Experience",
      "publisher": "Joe Rogan",
      "cover": "https://i.scdn.co/image/ab6765630000ba8a..."
    },
    // ... 20 entries total
  ]
}
```

When the anonymous context returns an empty chart (some markets/accounts may legitimately yield zero items), the result is `{ "entries": [] }`.

## Usage

```
websculpt spotify get-podcast-chart
```

## Common Error Codes

- `DRIFT_DETECTED` — the browser handle could not create an anonymous context, or the page structure changed such that neither GraphQL capture nor DOM parsing produced show cards.
- `EMPTY_RESULT` — reserved; currently an empty chart is returned as `{ entries: [] }` rather than an error.
- Browser attach errors (`BROWSER_ATTACH_REQUIRED`) — the daemon could not attach to Chrome; resolve the remote-debugging consent and retry.
