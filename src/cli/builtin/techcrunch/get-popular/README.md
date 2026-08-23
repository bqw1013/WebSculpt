# techcrunch/get-popular

Fetch TechCrunch's **Most Popular** module — the most-read articles of the last few days shown in the sidebar of the `techcrunch.com` homepage. This is TechCrunch's only reader-popularity signal (as opposed to `techcrunch/get-feed`, which returns the chronological latest stream).

## Description

The Most Popular module is server-rendered only on the homepage (`https://techcrunch.com/`). It has no standalone page and no API, so this command downloads the homepage HTML and parses the module. The module currently holds about 5-10 items; the count fluctuates day to day.

## Parameters

| name  | type   | required | default | description |
|-------|--------|----------|---------|-------------|
| limit | number | no       | 10      | Maximum number of articles to return (1-20). The module only holds about 5-10 items, so values above the actual module size return everything available with `partial=true`. The cap of 20 exists because the module is a small fixed homepage block that can never exceed that many items. |

## Return Value

```jsonc
{
  "articles": [
    {
      "title": "Some Claude users are mad that Anthropic’s new watermarks will catch them using it at their jobs, classes",
      "url": "https://techcrunch.com/2026/08/12/some-claude-users-are-mad-that-anthropics-new-watermarks-will-catch-them-cheating-at-their-jobs-classes/",
      "author": {
        "name": "Lucas Ropek",
        "profileUrl": "https://techcrunch.com/author/lucas-ropek/"
      },
      "date": null
    }
  ],
  "partial": false
}
```

- `articles` — the article cards, in the module's own ranking order (most popular first).
  - `title` — headline text.
  - `url` — canonical article URL.
  - `author.name` — author display name.
  - `author.profileUrl` — author archive URL, usable directly with `techcrunch/get-author`.
  - `date` — always `null`; the Most Popular cards display no publish date.
- `partial` — `true` when the requested `limit` exceeds the number of items the module currently holds (i.e. everything available was returned).

## Usage

```
websculpt techcrunch get-popular
websculpt techcrunch get-popular --limit 5
websculpt techcrunch get-popular --limit 20
```

## Common Error Codes

| code              | meaning                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `INVALID_PARAM`   | `limit` is not an integer between 1 and 20.                             |
| `NETWORK_ERROR`   | Failed to reach the TechCrunch homepage.                                |
| `RATE_LIMITED`    | Homepage returned HTTP 403/429 (blocked / rate limited); retry later.   |
| `NOT_FOUND`       | Homepage returned HTTP 404.                                             |
| `API_ERROR`       | Homepage returned another non-2xx status.                               |
| `DRIFT_DETECTED`  | The Most Popular module could not be found in the homepage HTML (page structure likely changed). |
| `EMPTY_RESULT`    | The module is present but contains no articles.                         |
