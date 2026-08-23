# twitch/get-feed

Browse live Twitch channels — the live-channel grid on `twitch.tv/directory/all` (all channels) or `twitch.tv/directory/category/{slug}` (a specific game/category).

## Description

Returns live-channel cards: channel login, stream title, category name + slug, live viewer count, thumbnail, and URL. Supports filtering by category slug, broadcaster language (34 options), and the four sort orders from the page's sort dropdown. Anonymous sessions are capped at roughly 30–34 channels because cursor pagination is blocked by Twitch's integrity challenge; the command returns `partial: true` when the grid is exhausted. No login required.

**Sort note**: Twitch's server silently ignores the `viewers` (VIEWER_COUNT) sort value — verified against the real browser request, which sends the identical body plus the integrity token and still receives RELEVANCE-ordered data. The command therefore applies `viewers` (and `viewers-asc`) ordering **client-side** over the fetched page: `--sort viewers` means "top N by viewers within the returned (~30-item) set".

## Parameters

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `category` | no | — | Category (game) slug, e.g. `league-of-legends`, `just-chatting`. Omit to browse all live channels. Discovery: `twitch/search --type category`. |
| `language` | no | — | Broadcaster language filter. One of: `zh`(中文) `en` `id`(Bahasa Indonesia) `ca`(Català) `da`(Dansk) `de`(Deutsch) `es`(Español) `fr`(Français) `it`(Italiano) `hu`(Magyar) `nl`(Nederlands) `no`(Norsk) `pl`(Polski) `pt`(Português) `ro`(Română) `sk`(Slovenčina) `fi`(Suomi) `sv`(Svenska) `tl`(Tagalog) `vi`(Tiếng Việt) `tr`(Türkçe) `cs`(Čeština) `el`(Ελληνικά) `bg`(Български) `ru`(Русский) `uk`(Українська) `ar`(العربية) `ms`(بهاس ملايو) `hi`(मानक हिन्दी) `th`(ภาษาไทย) `ja`(日本語) `ko`(한국어) `asl`(American Sign Language) `other`(其他). |
| `sort` | no | `recommended` | `recommended`(为您推荐) / `viewers`(观众人数高到低) / `viewers-asc`(观众人数低到高) / `recent`(最近开始). `viewers`/`viewers-asc` are applied client-side over the fetched page (server ignores the descending enum); `viewers` = top N by viewers within the returned set. |
| `limit` | no | `20` | Maximum number of live channels to return. Between 1 and 100. Anonymous sessions cap at ~30–34. |

## Return Value

```json
{
  "category": null,
  "language": "zh",
  "sort": "recommended",
  "limit": 5,
  "items": [
    {
      "channel": "lckespa2026",
      "title": "中文解说KESPA DN SOOPers T1 on KeSPA 2026 KeSPA Cup 2026 LCK",
      "category": "League of Legends",
      "categorySlug": "league-of-legends",
      "viewers": 9631,
      "thumbnailUrl": "https://static-cdn.jtvnw.net/previews-ttv/live_user_lckespa2026-640x360.jpg",
      "url": "https://www.twitch.tv/lckespa2026"
    }
  ],
  "count": 1,
  "partial": false
}
```

`partial` is `true` when fewer results are available than requested (e.g. `limit` exceeds the anonymous grid cap of ~30–34).

## Usage

```bash
# All live channels, recommended sort
websculpt twitch get-feed

# Top League of Legends channels by viewers
websculpt twitch get-feed --category league-of-legends --sort viewers

# Chinese-language streams
websculpt twitch get-feed --language zh

# First 10 streams on Just Chatting, most recent
websculpt twitch get-feed --category just-chatting --sort recent --limit 10
```

## Common Error Codes

- `INVALID_PARAM` — `sort` or `language` is not a recognized enum value.
- `INVALID_LIMIT` — `limit` is not a positive integer between 1 and 100.
- `EMPTY_RESULT` — the directory page loaded but no live channels were found.
- `DRIFT_DETECTED` — the Twitch directory grid structure changed or the page did not load.
- `BROWSER_ATTACH_REQUIRED` — Chrome/Edge remote debugging is not enabled (runner-level).
