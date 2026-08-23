# substack/get-feed

Fetch Substack personal feed or a public category feed.

## Description

This command returns a normalized list of posts and notes from Substack. Without `--category` it fetches the logged-in user's personal "For you" feed. With `--category` it fetches the public feed for that category.

## Parameters

- `--category` string (optional): Category slug. When omitted, the personal feed is fetched.
- `--sort` string (optional, default `recent`): Sort order. Only used with `--category`.
  - `recent` — newest notes and posts
  - `posts` — long-form posts only
- `--limit` number (optional, default `20`, max `100`): Maximum items to return.

## Category slugs

Available category slugs for `--category`:

`technology`, `us-politics`, `political-philosophy`, `hobbies-interests`, `us-government-policy`, `football-(soccer)`, `programming-development`, `investigative-journalism`, `physics-chemistry`, `online-learning`, `software-apps`, `video-games`, `local-news`, `k-12-education`, `sports`, `health-politics`, `national-news`, `international`, `cultural-commentary`, `us-political-satire`, `sustainable-living`, `banking-credit`, `marketing`, `photography`, `ux/ui-design`, `comics`, `humor`, `travel`, `business`, `fiction`, `literature`, `faith`, `world-politics`, `food`, `fashionandbeauty`, `design`, `music`, `culture`, `history`, `finance`, `news`, `film-and-tv`, `art`, `climate`, `parenting`, `science`, `health`, `home-garden`, `crypto`, `philosophy`, `education`.

## Return Value

Array of feed items:

```json
[
  {
    "type": "post",
    "title": "...",
    "author": "...",
    "author_handle": "...",
    "author_url": "...",
    "publication_name": "...",
    "publication_url": "...",
    "url": "...",
    "published_at": "...",
    "snippet": "...",
    "like_count": 0,
    "comment_count": 0,
    "restack_count": 0
  }
]
```

## Usage

```bash
# Personal feed (requires login)
websculpt substack get-feed

# Technology category, recent
websculpt substack get-feed --category technology

# Technology category, posts only
websculpt substack get-feed --category technology --sort posts

# Limit results
websculpt substack get-feed --category technology --limit 5
```

## Common Error Codes

- `AUTH_REQUIRED` — personal feed requested but Substack session is not logged in.
- `INVALID_PARAM` — unknown category slug or invalid sort/limit value.
- `EMPTY_RESULT` — feed returned no usable items.
- `DRIFT_DETECTED` — Substack API response shape changed.
- `API_ERROR` — non-2xx response from Substack API.

## Prerequisites

- Chrome remote debugging enabled (WebSculpt browser environment).
- Login only required for the personal feed; category feeds are public.
