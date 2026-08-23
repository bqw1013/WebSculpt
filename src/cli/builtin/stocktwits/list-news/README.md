# stocktwits/list-news

List Stocktwits' editorial market news with full text per article.

## Description

Fetches Stocktwits editorial market news (the feed behind stocktwits.com/news-articles) from the site's own load-more JSON API. Each article in the default `stocktwits` tab carries its FULL HTML body (`content`, 3-6KB per article), so no separate article-detail request is needed. Anonymous — no login, no browser.

## Parameters

| name | type | required | default | description |
|---|---|---|---|---|
| `tab` | enum | no | `stocktwits` | Feed tab. See "Tab shapes" below. |
| `limit` | number | no | 10 | Max articles, 1-50. `limit=50` verified to return 50 in one call. |
| `after_sid` | string | no | - | Pagination cursor: the `sid` of the last article of the previous page; pass it to fetch the next page of older articles. |

### Tab shapes (platform truth, returned natively)

| tab | shape | content |
|---|---|---|
| `stocktwits` (default) | array | full HTML body (3-6KB) |
| `crypto` | array | summary-only (`content` is an empty string) |
| `trending` | object `{symbol: [articles]}` | summary-only (`content` is an empty string) |
| `stocks` | object `{symbol: [articles]}` | summary-only (`content` is an empty string) |
| `watchlist` | empty array | anonymous only; requires login |

## Return Value

```json
{
  "tab": "stocktwits",
  "status": "success",
  "articles": [
    {
      "sid": "aaaa00000000",
      "headline": "Example Market News Headline",
      "summary": "Example summary text for the article.",
      "content": "<ul class=\"summary-bullets\"><li>Example bullet point.</li></ul><p>Example article body.</p>",
      "createdAt": "2026-08-20T13:09:26Z",
      "updatedAt": "2026-08-20T13:09:26Z",
      "urlSlug": "example-market-news-headline",
      "canonicalUrl": "https://stocktwits.com/news-articles/markets/example-market-news-headline",
      "category": { "id": 2, "name": "Markets" },
      "subcategory": { "id": 3, "name": "Equity", "parent_id": 2 },
      "primarySymbolCode": "EXAMPLE",
      "symbolCodes": ["EXAMPLE"],
      "symbolsMetadata": { "EXAMPLE": { "symbol": "EXAMPLE", "logo_url": "https://logos.stocktwits-cdn.com/EXAMPLE.webp", "deeplink": "symbol/EXAMPLE" } },
      "tags": [ { "id": 2, "tag_name": "Trending" } ],
      "source": { "id": 1000, "source_name": "Stocktwits", "url_domain": "stocktwits.com" },
      "featuredImage": "https://news.stocktwits-cdn.com/large_example_image.webp",
      "author": {
        "id": 100,
        "name": "Example Author",
        "designation": "Staff Writer",
        "description": "Example author biography text.",
        "profile_avatar": "https://news.stocktwits-cdn.com/example_author.png",
        "social_media_links": { "twitter": "https://x.com/example" }
      }
    }
  ],
  "partial": false
}
```

`partial` is `true` when fewer than `limit` articles were returned (end of feed, or an anonymous `watchlist` request).

## Usage

```bash
# Default: 10 latest editorial articles with full text
websculpt stocktwits list-news

# 3 articles
websculpt stocktwits list-news --limit 3

# 50 at once
websculpt stocktwits list-news --limit 50

# Next page (cursor = last sid of the previous page)
websculpt stocktwits list-news --limit 10 --after_sid cZYIjdLRJmj

# Other tabs
websculpt stocktwits list-news --tab trending
websculpt stocktwits list-news --tab crypto
websculpt stocktwits list-news --tab watchlist
```

## Common Error Codes

- `INVALID_PARAM` — unknown `tab` value, or `limit` not an integer in 1-50.
- `NETWORK_ERROR` — request failed, or the response was not valid JSON.
- `RATE_LIMITED` — HTTP 429/403 persisted after 3 backoff retries.
- `API_ERROR` — non-2xx HTTP response, or `status` field != "success" (API drift).
