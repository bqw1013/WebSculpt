# Evidence: devto/get-trends

This document records the research and validation evidence for the `devto/get-trends` command.

## Exploration Path

- Checked the WebSculpt command library: existing `devto` commands (`get-article`, `get-organization`, `get-user`, `list-articles`, `list-tags`) do not cover DEV.to community trends.
- Verified the public Forem API for a trends endpoint and confirmed none exists.
- Used Playwright CLI to attach the local browser and explored the `/trending` page and its filtered variant `/trending?tag=<tag>`.
- 已阅读 guide.md.

## Verified URLs

- `https://dev.to/api/trending` — returns `404 Not Found`; no public API path for trends.
- `https://dev.to/trending` — index page listing all emergent trends.
- `https://dev.to/trending?tag=<tag>` — filtered view for a single tag.
- `https://dev.to/trending?tag=<nonexistent-tag>` — invalid tag silently falls back to the all-trends view.

## Structural Evidence

- Page heading: `h1` with text `Emergent Trends`.
- Filter navigation: `<nav aria-label="Filter trends by tag">` containing `All Trends` plus tag links of the form `/trending?tag=<name>`.
- Trend cards container: `<div class="grid gap-4 m:grid-cols-2 pb-6">`.
- Trend card selector: `.trend-card` (`<div class="crayons-card trend-card ...">`).
- Per-card structure:
  - Tag link: `a[href^="/t/"]` with text `# <name>`.
  - Post count text: contains pattern `<N> posts in the last 7 days`.
  - Title: `h2` containing an `<a href="/trending/<slug>">`.
  - Cover image: `img` inside the card.
  - Summary: first `<p>` element.
  - Key areas: `<h4>` containing `Key Areas of Focus:` followed by a `<ul>` of prompts.
  - Active time: text matching `Active <relative time> ago`.
  - Detail link: `a` with text `Explore Trend →` or the title link.

## Failure Signals

- API path: `GET /api/trending` returns HTTP 404 with JSON body `{"status":404,"error":"Not Found"}`.
- Invalid tag filter: the page does not show an empty state; it renders the same content as `All Trends`.
- Structural drift: if `.trend-card` is absent after navigation, the page layout has changed.
- Browser attach failure: daemon cannot connect over CDP; surfaced as `BROWSER_ATTACH_REQUIRED`.
- Network failure: `page.goto` throws (timeout, DNS, reset); surfaced as `NETWORK_ERROR`.

## Capture Assessment

This command should be captured because:

- The `/trending` page provides unique AI-generated community trend summaries that are not available through any public API.
- The extraction path is stable and fully server-side rendered, requiring no complex interactions or login state.
- The page structure is regular and parameterizable via a single optional `tag` filter.
