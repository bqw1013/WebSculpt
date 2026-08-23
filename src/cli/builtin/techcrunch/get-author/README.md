# techcrunch/get-author

Fetch a TechCrunch author's profile and article list from their server-rendered archive page. This is the only way to enumerate a TechCrunch author's work: the WordPress REST `users` endpoint is disabled (404) and `posts?author=` returns an empty array, so this command parses the HTML archive instead of the API.

## Description

Given an author slug, returns the author's profile (name, avatar, bio) plus their articles, newest first. The archive paginates internally at 30 cards per page; the command follows pagination until the requested limit is reached or the archive ends.

## Parameters

- `author` (required): Author slug as it appears in the author page URL — `techcrunch.com/author/{slug}/`, e.g. `lucas-ropek` or `margaux-macColl`. Hyphenated words; may contain capital letters. Discover it by clicking an author byline on any TechCrunch article, or from the `author.slug` field returned by `techcrunch/get-article`.
- `limit` (optional, default 20, 1-100): Maximum number of articles to return. Paginates the archive internally.

## Return Value

```json
{
  "author": {
    "name": "Lucas Ropek",
    "slug": "lucas-ropek",
    "profileUrl": "https://techcrunch.com/author/lucas-ropek/",
    "avatar": "https://techcrunch.com/wp-content/uploads/2025/12/495cdfd5deaad915a1ad58ab35edcbaa84b90c4ce9b7ded356c5ad1b61884800.png",
    "bio": "Lucas is a senior writer at TechCrunch, where he covers artificial intelligence, consumer tech, and startups."
  },
  "articles": [
    {
      "title": "OpenAI introduces ‘Ultrafast,’ a new mode that makes GPT-5.6 Sol work at 14x the speed",
      "url": "https://techcrunch.com/2026/08/13/openai-introduces-ultrafast-a-new-mode-that-makes-gpt-5-6-sol-work-at-14x-the-speed/",
      "date": "2026-08-13T12:22:40-07:00",
      "excerpt": "",
      "image": "https://techcrunch.com/wp-content/uploads/2026/02/EU-ai-1258475609.jpg",
      "categories": ["artificial-intelligence"]
    }
  ],
  "partial": false
}
```

Field notes:

- `author.avatar` and `author.bio` are empty strings when the author has no photo or bio.
- `articles[].excerpt` is **always empty**: the archive page cards render only category, title, author and time, never an excerpt. The field is retained for schema stability with sibling TechCrunch commands; treat it as unavailable here.
- `articles[].image` is the featured image URL with the WordPress resize query stripped, or an empty string for the occasional card without a featured image.
- `articles[].categories` are the article's editorial category slugs (from the card's CSS classes). The meta-category `tc` and the test residue `ben-test-2` are filtered out.
- `partial` is `true` when the archive ran out before the requested `limit` was reached.

## Usage

```
websculpt techcrunch get-author --author lucas-ropek
websculpt techcrunch get-author --author brian-heater --limit 5
websculpt techcrunch get-author --author anthony-ha --limit 100
```

## Common Error Codes

- `MISSING_PARAM` — `author` is empty or not provided.
- `INVALID_PARAM` — `author` is not a valid lowercase-hyphenated slug, or `limit` is not an integer in 1-100.
- `NOT_FOUND` — no TechCrunch author exists for the given slug (the author page returns HTTP 404).
- `HTTP_ERROR` — the archive page returned an unexpected non-2xx status.
- `NETWORK_ERROR` — request failed at the network level.
- `DRIFT_DETECTED` — a 200 page was returned but the expected author-hero or article-card markup was absent (site structure changed).
