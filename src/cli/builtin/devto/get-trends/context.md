# Context

## Precipitation Background (Why This Command Exists)

DEV.to provides a `/trending` page that shows emergent community trends with AI-generated analysis summaries. This content is not available through the public Forem API (`/api/trending` returns 404), so it must be extracted from the rendered page via browser automation.

## Value Assessment

- Unique data source: the trend analysis text and key discussion areas are only available on the `/trending` page.
- Simple, stable input: a single optional `tag` filter.
- No authentication required, making it broadly reusable.

## Page Structure

- Index URL: `https://dev.to/trending`
- Filtered URL: `https://dev.to/trending?tag=<tag>`
- Filter navigation: `nav[aria-label='Filter trends by tag']` with links `/trending?tag=<name>`.
- Card container: `div.grid.gap-4.m\:grid-cols-2.pb-6`.
- Card selector: `.trend-card` (`div.crayons-card.trend-card...`).
- Card contents:
  - tag link: `a[href^="/t/"]`
  - post count: text matching `\d+ posts in the last 7 days`
  - title: `h2 > a[href^="/trending/"]`
  - cover image: `img`
  - summary: first `p`
  - key areas: `h4` containing `Key Areas of Focus:` followed by `ul > li`
  - active time: text matching `Active ... ago`

## Environment Dependencies

- Requires a browser with remote debugging enabled.
- No DEV.to login required.
- Page is server-side rendered, so extraction can begin after `domcontentloaded`.

## Failure Signals

- `.trend-card` selector returns no elements: page structure has drifted.
- Filter nav missing: layout may have changed.
- Invalid tag provided by the user: the page silently falls back to `All Trends`; the command detects this by checking `available_tags` and returns `INVALID_PARAM` instead of following the fallback.

## Repair Clues

- If the card class changes, search for the nearest ancestor of `h2` containing `posts in the last 7 days`.
- If the filter nav label changes, fall back to `a[href*='tag=']`.
- If post counts disappear, `posts_count_7d` can be made nullable rather than failing.
