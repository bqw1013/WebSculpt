# Evidence: devto/list-tags

## Exploration Path

- Checked command library with `websculpt command domains`; no `devto` domain existed.
- Loaded `websculpt-explore` and created `devto-list-tags-browser` workspace.
- Read `skills/websculpt-explore/references/access/playwright-cli-guide.md` before any Playwright CLI operation.
- Attached the local browser via `playwright-cli` session `{session_id}` and explored both the API and the `/tags` page.

## Verified URLs

- `https://dev.to/api/tags`
- `https://dev.to/api/tags?per_page=1000`
- `https://dev.to/tags`
- `https://dev.to/tags?q=python`
- `https://dev.to/tags?q=py`
- `https://dev.to/tags?q=xyznonexistent`

## Structural Evidence

### API path

Endpoint: `GET /api/tags?per_page=<limit>`

Response shape (array):

```json
[
  {
    "id": 8,
    "name": "webdev",
    "bg_color_hex": "#562765",
    "text_color_hex": "#ffffff",
    "short_summary": "Because the internet..."
  }
]
```

- `per_page` maximum is 1000.
- No server-side `query` parameter is supported.
- Response headers do not include rate-limit metadata; the endpoint is publicly accessible.

### Browser path

Page: `https://dev.to/tags` (no query) or `https://dev.to/tags?q=<query>` (with query)

Card selector: `.js-tag-card.tag-card`

Each card contains:

- Name: `a.crayons-tag` text, e.g. `#{name}` -> strip `#`.
- Posts count: `div.fs-xs.color-base-60`, e.g. `{count} posts`.
- Summary: `p.truncate-at-3`.
- Color: `a.crayons-tag` inline style contains `--tag-prefix: {hex}`.

Sample extracted card:

```json
{
  "name": "python",
  "countText": "123,535 posts",
  "summary": "import antigravity",
  "bg": "#306998"
}
```

Empty-state signal when `q` matches nothing: body text contains "No results match".

## Failure Signals

- API non-2xx or fetch exception.
- Page load succeeds but `.js-tag-card.tag-card` never appears and no empty-state text is present.
- Expected child elements inside a card are missing.

## Capture Assessment

This command should be captured. Both the API path and the browser fallback path were verified with real requests and page extraction. The output schema can be unified across both sources, and the command addresses a common content-discovery need on DEV.to.
