# wikipedia/get-daily

Fetch Wikipedia's daily aggregation for a given UTC date.

## Description

Returns the daily featured-content bundle from a Wikipedia language edition: today's featured article, most-read articles with view counts, historical events for this day, and the picture of the day. Fields that are not available for the requested language edition are omitted rather than returning null.

## Parameters

- `--date` (optional): Date in `YYYY-MM-DD`. Defaults to today's UTC date.
- `--language` (optional): Wikipedia language edition code. Common values: `zh`, `en`, `ja`, `ko`, `fr`, `de`, `es`, `ru`. Defaults to `zh`.

## Return Value

```typescript
{
  date: string;        // YYYY-MM-DD as requested
  language: string;
  tfa?: {
    title: string;
    description?: string;
    extract: string;
    url: string;
    image?: string;
  };
  mostread?: {
    date: string;      // actual pageview date, usually one day behind
    articles: Array<{
      title: string;
      views: number;
      rank: number;
      url: string;
      description?: string;
      extract?: string;
      image?: string;
    }>;
  };
  onthisday?: Array<{
    year: number;
    text: string;
    links: Array<{ title: string; url: string }>;
  }>;
  image?: {
    title: string;
    url: string;
    source?: string;
    thumbnail?: string;
  };
}
```

## Usage

```bash
websculpt wikipedia get-daily
websculpt wikipedia get-daily --date 2024-01-01
websculpt wikipedia get-daily --language en
websculpt wikipedia get-daily --date 2024-01-01 --language ja
```

## Common Error Codes

- `INVALID_PARAM`: Invalid date format, future date, or invalid language code.
- `NOT_FOUND`: Feed returned 404 (e.g. invalid date).
- `EMPTY_RESULT`: Feed contained no usable content.
- `NETWORK_ERROR`: Cannot reach `*.wikipedia.org`. May require a suitable network egress path depending on region.
- `RATE_LIMITED`: Reserved for rate-limit responses.

## Prerequisites

- Internet access to `*.wikipedia.org`.
- No login or API key required.
