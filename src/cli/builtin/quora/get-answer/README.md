# quora/get-answer

Fetch the full content of a single Quora answer by its URL.

## Description

`quora/get-answer` loads a Quora answer page in a browser and returns the answer text, question reference, author information, engagement metrics, optional About the Author stats, and an optional comment thread. It is meant to be used after discovering answer URLs with `quora/search` or `quora/get-question`.

## Parameters

- `--url` (required): Full Quora answer URL. Supports standard URLs such as `https://www.quora.com/<question-slug>/answer/<author-slug>` and Space subdomain URLs such as `https://<space>.quora.com/<question-slug>`.
- `--include_comments` (optional, default `false`): Set to `true` to load the answer's comments. Comments are loaded in batches by clicking "View more comments", so this is slower.
- `--comment_limit` (optional, default `20`): Maximum number of top-level comments to return, between `1` and `100`. Only applies when `--include_comments=true`.
- `--include_html` (optional, default `false`): Set to `true` to also return the raw HTML of the answer body.

## Return Value

```json
{
  "answer": {
    "url": "string",
    "question": { "title": "string", "url": "string" },
    "author": {
      "name": "string",
      "profileUrl": "string",
      "credential": "string?",
      "followerCount": "number?",
      "contentViews": "string?",
      "monthlyViews": "string?",
      "activeSpaces": "number?",
      "joined": "string?"
    },
    "publishedAt": "string?",
    "upvoteCount": "number",
    "commentCount": "number",
    "shareCount": "number?",
    "viewCount": "string?",
    "fullText": "string",
    "fullHtml": "string?"
  },
  "comments": [
    {
      "author": { "name": "string", "profileUrl": "string?" },
      "text": "string",
      "publishedAt": "string",
      "upvoteCount": "number?",
      "isReply": "boolean",
      "replies": "Array<...>?"
    }
  ],
  "partial": "boolean?"
}
```

## Usage

```bash
# Basic answer
websculpt quora get-answer --url "https://www.quora.com/What-is-the-scariest-aspect-of-artificial-intelligence/answer/Lindsay-Elizabeth-34"

# With comments
websculpt quora get-answer --url "https://www.quora.com/What-is-the-scariest-aspect-of-artificial-intelligence/answer/Lindsay-Elizabeth-34" --include_comments true --comment_limit 10

# With HTML
websculpt quora get-answer --url "https://www.quora.com/What-is-the-scariest-aspect-of-artificial-intelligence/answer/Lindsay-Elizabeth-34" --include_html true
```

## Common Error Codes

- `MISSING_PARAM`: `--url` is missing.
- `INVALID_PARAM`: `--url` is not a Quora URL or `--comment_limit` is out of range.
- `NOT_FOUND`: The question or answer does not exist, or the author slug is invalid and Quora redirected to the question page.
- `DRIFT_DETECTED`: The expected page structure changed and the command could not extract the answer.
