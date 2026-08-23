# kickstarter/discover

## Description

Discover and search Kickstarter projects from the browser — the same backend powering both the Discover page (`kickstarter.com/discover`) and the search box (which redirects to the same page with `term=`). Without `--term`, it browses projects with filters; with `--term`, it searches by keyword. Filter by category/subcategory, project state, staff picks, and sort order.

## Parameters

- `--term` (optional): Search keywords (e.g. `3d printer`). Omit to browse without searching. 中文：搜索关键词；不传即浏览模式。
- `--category` (optional): Top-level category slug (e.g. `technology`, `film & video`). Valid values come from `kickstarter/list-categories`. 中文：一级类目 slug。
- `--subcategory` (optional): Subcategory slug (e.g. `3d printing`). Must be used together with its parent `--category`. 中文：子类目 slug，须与父类目同用。
- `--sort` (optional, default `magic`): `magic` 相关度 / `popularity` 热门度 / `newest` 最新 / `end_date` 即将结束 / `most_funded` 筹款最多(历史总榜) / `most_backed` 支持者最多。
- `--state` (optional, default empty = site default): Comma-separated states — `upcoming` 预启动 / `live` 进行中 / `successful` 已成功结束 / `late_pledge` 后期认捐。Empty uses the site default set (upcoming+live+late_pledge). E.g. `--state successful` or `--state live,successful`.
- `--staff_picks` (optional, default `false`): `true` = only "Projects We Love" (editorial picks). 中文：是否只看官方编辑精选。
- `--limit` (optional, default `12`, max `100`): Maximum projects to return. Internal pagination (per-page cap 48); `partial: true` when the stream is exhausted first. 中文：条数上限。

## Return Value

```json
{
  "projects": [
    {
      "id": 2124857724, "name": "Sanctuary: Shattered Sun - RTS PC GAME",
      "blurb": "Set on the surface of a fractured Dyson Sphere...", "slug": "sanctuary-shattered-sun",
      "url": "https://www.kickstarter.com/projects/enhearten-media/sanctuary-shattered-sun",
      "photo_full": "https://i.kickstarter.com/assets/..._original.png?...",
      "state": "live", "goal": 143000, "pledged": 1223244, "percent_funded": 855.4153846153847,
      "backers_count": 8825, "currency": "AUD", "deadline": 1787238933, "launched_at": 1784646933,
      "staff_pick": true, "prelaunch_activated": true,
      "creator": { "name": "Enhearten Media", "slug": "enhearten-media", "avatar": "https://i.kickstarter.com/assets/..." },
      "category": { "id": 341, "slug": "technology/wearables", "parent_name": "Technology" },
      "location": { "displayable_name": "Brisbane, AU", "country": "AU", "state": "QLD" }
    }
  ],
  "total_hits": 4484,
  "partial": false
}
```

## Usage

```
websculpt kickstarter discover
websculpt kickstarter discover --term "3d printer"
websculpt kickstarter discover --category technology --subcategory "3d printing" --sort newest --limit 20
websculpt kickstarter discover --state successful --sort most_funded --limit 50
websculpt kickstarter discover --staff_picks true --limit 5
```

## Notes

- **Category filtering is the site's own behavior.** `category`/`subcategory` are resolved to the numeric `category_id` that Kickstarter's backend uses. The backend's category match is relevance/related-category based (not a strict whitelist), so a small share of results may come from adjacent categories (e.g. the "3D printing" page also surfaces 3D-printable STL tabletop-mini games). This exactly matches what the site's own category pages (`/discover/categories/...`) display — the same `/discover/advanced.json` backend. 中文：类目筛选用的是站点同款后端的相关度匹配，少量结果可能落在相邻类目，与官网类目页行为一致。
- **State default.** Omit `--state` to use the site's default browsing set (upcoming + live + late_pledge). To include ended/funded projects add `--state successful`.
- `--term` values are URL-encoded automatically; `--limit` over the per-page cap of 48 is collected across multiple pages internally.

## Common Error Codes

- `INVALID_PARAM`: `--limit` outside 1-100, unknown `--sort`, unknown `--state`, unknown `--category`/`--subcategory` slug, or `--subcategory` without `--category`.
- `PLATFORM_BLOCKED`: Cloudflare challenge / CAPTCHA, or the site returns a non-200 response (e.g. HTTP 403). Requires a browser session with remote debugging enabled.
- `RATE_LIMITED`: Kickstarter returned HTTP 429 (rare; the endpoint is lenient).
- `DRIFT_DETECTED`: Response is not the expected JSON (structure drift), or the `/graph` category-resolution call returned field errors.
- `BROWSER_ATTACH_REQUIRED` / `DAEMON_BUSY` / `COMMAND_TIMEOUT`: infrastructure errors from the runner/daemon.

## Prerequisites

- Browser session: user's Chrome must have `chrome://inspect/#remote-debugging` enabled with remote debugging allowed, and the WebSculpt daemon must be running.
- No login required.
