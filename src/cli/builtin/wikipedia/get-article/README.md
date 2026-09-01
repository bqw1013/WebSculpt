# wikipedia/get-article

Fetch a Wikipedia article's structured content by title.

## Description

Given an article title or full Wikipedia URL, this command returns the article's structured data using the public MediaWiki API. You can request the lead summary, full body, infobox key-value pairs, categories, related links, multilingual versions, main image, and last-edit information.

## Parameters

- `title` (required): Article title (e.g. `{title}`) or full URL `https://{lang}.wikipedia.org/wiki/{title}`.
- `language` (optional): Language edition code. Default is `zh`. Common values include `zh`, `en`, `ja`, `ko`, `fr`, `de`, `es`, `ru`; any valid MediaWiki language code works.
- `include` (optional): Content scope. Default is `summary`.
  - `summary`: lead paragraph only.
  - `full`: lead paragraph + full article body.
  - `infobox`: lead paragraph + infobox key-value pairs.
  - `all`: lead paragraph + full body + infobox.

## Return Value

```json
{
  "title": "{title}",
  "pageid": 12345,
  "description": "Short description",
  "url": "https://{lang}.wikipedia.org/wiki/{title}",
  "language": "zh",
  "summary": "Lead paragraph text...",
  "body": "Full article text...",
  "infobox": [
    { "key": "Field", "value": "Value" }
  ],
  "categories": ["Category A", "Category B"],
  "related": ["Related article A", "Related article B"],
  "langlinks": [
    { "lang": "en", "title": "English title" }
  ],
  "image": "https://upload.wikimedia.org/...",
  "last_edited": {
    "user": "{editor}",
    "timestamp": "2026-08-30T...Z",
    "revid": 123456789,
    "comment": "Edit summary"
  }
}
```

Fields marked optional in the description are omitted when no value is available.

## Usage

```bash
websculpt wikipedia get-article --title "{title}"
websculpt wikipedia get-article --title "{title}" --include full
websculpt wikipedia get-article --title "https://{lang}.wikipedia.org/wiki/{title}" --language en --include all
```

## Common Error Codes

- `INVALID_PARAM`: Missing or invalid parameter (e.g. empty title, unsupported `include` value).
- `NOT_FOUND`: The requested article does not exist.
- `EMPTY_RESULT`: The API returned no usable page data.
- `NETWORK_ERROR`: Cannot reach Wikipedia (often needs a suitable egress path in restricted network environments).
- `RATE_LIMITED`: Defensive error for possible Wikipedia rate limiting.
