# techcrunch/get-article

Fetch the full content of a single TechCrunch article by URL (or slug), powered by the public WordPress REST API. No login and no browser required.

## Description

Given an article URL or slug, this command returns the complete article: title, canonical URL, slug, publish/modified dates, author (name + slug + profile URL), excerpt, full body text in both HTML and plain-text form, featured image, editorial categories, and topic tags.

TechCrunch has no comment system, so no comment options exist. Related articles are intentionally not returned.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | Full article URL (e.g. `https://techcrunch.com/2026/08/13/some-article-slug/`) or just the slug (`some-article-slug`). |

## Return Value

```json
{
  "title": "Article title",
  "url": "https://techcrunch.com/2026/08/13/some-article-slug/",
  "slug": "some-article-slug",
  "date": "2026-08-13T15:12:40",
  "modified": "2026-08-13T16:06:30",
  "author": {
    "name": "Aisha Malik",
    "slug": "aisha-malik",
    "profileUrl": "https://techcrunch.com/author/aisha-malik/"
  },
  "excerpt": "Plain-text summary.",
  "contentHtml": "<p>Full body HTML…</p>",
  "contentText": "Plain-text version of the full body.",
  "image": "https://techcrunch.com/wp-content/uploads/2026/08/cover.jpg",
  "categories": ["startups", "biotech-health"],
  "tags": ["lawsuit", "fraud", "in-brief"]
}
```

Notes:
- `categories` and `tags` are **slugs** (lowercase, hyphenated), directly usable as `--category` for `techcrunch/get-feed` and `--topic` for `techcrunch/get-topic`.
- `author.slug` and `author.profileUrl` feed directly into `techcrunch/get-author`.
- `image` is `null` when the article has no featured image.
- `contentText` is the plain-text extraction of `contentHtml` (tags stripped, HTML entities decoded, paragraphs preserved).

## Usage

```bash
websculpt techcrunch get-article --url "https://techcrunch.com/2026/08/13/investors-sue-selena-gomez-alleging-fraud-tied-to-her-mental-health-startup/"
websculpt techcrunch get-article --url "investors-sue-selena-gomez-alleging-fraud-tied-to-her-mental-health-startup"
```

## Common Error Codes

| Code | Meaning |
|---|---|
| `MISSING_PARAM` | The `url` parameter was not provided or blank. |
| `INVALID_PARAM` | The `url` is not a TechCrunch URL and not a valid slug, or the slug contains unsupported characters. |
| `NOT_FOUND` | The article slug does not exist on TechCrunch (API returned an empty result). |
| `API_ERROR` | TechCrunch API returned a non-2xx HTTP status. |
| `DRIFT_DETECTED` | The API response shape changed (e.g. body is not a JSON array). |
| `NETWORK_ERROR` | Network failure talking to the API. |
