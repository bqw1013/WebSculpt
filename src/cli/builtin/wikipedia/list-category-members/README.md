# wikipedia/list-category-members

List members of a Wikipedia category.

## Description

This command queries the public MediaWiki Action API and returns members of a Wikipedia category. You can filter by member type (articles, subcategories, files, or all) and control how many results to return.

## Parameters

- `category` (required): Category name without the `Category:` prefix, or the full category URL.
- `type` (optional): `page` | `subcat` | `file` | `all`. Default: `page`.
- `limit` (optional): Number of results to return, between 1 and 500. Default: `20`.
- `language` (optional): MediaWiki language code. Default: `zh`.

## Return Value

```json
{
  "category": "{category}",
  "type": "page",
  "language": "zh",
  "count": 20,
  "items": [
    {
      "title": "{member title}",
      "type": "page",
      "url": "https://{lang}.wikipedia.org/wiki/{encoded title}"
    }
  ]
}
```

## Usage

```bash
websculpt wikipedia list-category-members --category "{category}"
websculpt wikipedia list-category-members --category "{category}" --type subcat --limit 10
websculpt wikipedia list-category-members --category "https://en.wikipedia.org/wiki/Category:{category}" --language en
```

## Common Error Codes

- `INVALID_PARAM`: Missing or invalid parameter.
- `EMPTY_RESULT`: Category has no members of the requested type, or the category does not exist.
- `NETWORK_ERROR`: Cannot reach Wikipedia (often caused by missing suitable egress path in restricted network environments).
- `RATE_LIMITED`: Wikipedia rate limit encountered (defensive, rarely observed).
