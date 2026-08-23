# github/list-releases

List a GitHub repository's releases from `https://github.com/<owner>/<repo>/releases`.

## Description

Returns releases with tag name, title, draft/prerelease flags, publish date, release notes (body), and downloadable assets (name/size/download URL). Reads the server-rendered releases page directly; no login required. Assets are fetched from the page's `expanded_assets` endpoint inside the browser session.

## Parameters

- `repo` (required): Repository as `owner/repo` (e.g. `facebook/react`) or its full URL `https://github.com/facebook/react`.
- `limit` (optional, default `10`): Maximum releases to return, `1-100`. The page lists 10 per page; the command fetches additional pages (`?page=N`) until the limit is met. If the repository has fewer releases than requested, `partial=true` is returned.

## Return Value

```json
{
  "repo": "facebook/react",
  "count": 10,
  "partial": false,
  "releases": [
    {
      "tag_name": "v19.2.8",
      "name": "19.2.8 (July 21st, 2026)",
      "draft": false,
      "prerelease": false,
      "published_at": "2026-07-21T15:49:09Z",
      "body": "React Server Components ...",
      "html_url": "https://github.com/react/react/releases/tag/v19.2.8",
      "assets": [
        { "name": "Source code (zip)", "size": null,
          "download_url": "https://github.com/react/react/archive/refs/tags/v19.2.8.zip" }
      ]
    }
  ]
}
```

- `partial`: `true` when the repository has fewer releases than the requested `limit` (the list ended early).
- `draft`: always `false` when logged out; drafts are only visible to privileged logged-in users.
- `assets.size`: `null` for GitHub auto-generated source archives (zip/tar.gz), otherwise a size string like `38.6 MB`.

## Usage

```
websculpt github list-releases --repo facebook/react
websculpt github list-releases --repo facebook/react --limit 30
websculpt github list-releases --repo https://github.com/gohugoio/hugo --limit 5
```

## Common Error Codes

- `INVALID_PARAM`: `repo` missing/malformed, or `limit` not an integer in `1-100`.
- `NOT_FOUND`: repository does not exist (GitHub 404).
- `EMPTY_RESULT`: repository exists but has no releases.
- `BROWSER_ATTACH_REQUIRED`: no Chrome/Edge with remote debugging connected.
- `NETWORK_ERROR`: page could not be loaded.
