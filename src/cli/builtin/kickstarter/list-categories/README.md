# kickstarter/list-categories

Browser-runtime command that returns Kickstarter's complete category taxonomy.

## Description

Lists Kickstarter's 15 top-level categories and all 159 subcategories (slug + name), fetched from the site's own `/graph` GraphQL endpoint. These slugs are the valid values for the `category` and `subcategory` parameters of `kickstarter/discover`. Pass `--parent <top-level slug>` to return only that category's subcategories. Browser runtime is required because Node is rejected by Kickstarter's Cloudflare TLS-fingerprint challenge; the command navigates to the homepage and runs a same-origin in-page fetch to `/graph`. No login required.

## Parameters

| Name | Required | Default | Description |
|---|---|---|---|
| `parent` | no | (full tree) | Top-level category slug to list only its subcategories. 15 valid slugs: art 艺术, comics 漫画, crafts 手工艺, dance 舞蹈, design 设计, fashion 时尚, film & video 影视, food 食品, games 游戏, journalism 新闻, music 音乐, photography 摄影, publishing 出版, technology 科技, theater 戏剧. Unknown slugs raise `INVALID_PARAM`. |

## Return Value

```json
{
  "categories": [
    { "slug": "technology", "name": "Technology", "subcategories": [ { "slug": "3d printing", "name": "3D Printing" } ] }
  ],
  "total": 15
}
```

Without `--parent`, `total` is 15 (all top-level categories, each with its subcategories). With `--parent technology`, only the `technology` entry is returned (total 1), containing its 15 subcategories.

## Usage

```
websculpt kickstarter list-categories
websculpt kickstarter list-categories --parent technology
websculpt kickstarter list-categories --parent "film & video"
```

## Common Error Codes

- `PLATFORM_BLOCKED`: Kickstarter served a Cloudflare challenge / 403 (platform blocking).
- `RATE_LIMITED`: Kickstarter rate-limited the request (HTTP 429).
- `DRIFT_DETECTED`: the csrf-token meta or the `/graph` response shape changed.
- `INVALID_PARAM`: `--parent` is not one of the 15 top-level slugs.
- `API_ERROR`: `/graph` returned a non-JSON response.
- `NETWORK_ERROR`: could not navigate to the Kickstarter homepage.
