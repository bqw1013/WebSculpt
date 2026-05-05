# Context

## Background

This command was captured to address the need of extracting full content from Zhihu column articles (zhuanlan.zhihu.com), which are client-side rendered and not suitable for static scraping.

## Value Assessment

Medium. Zhihu column articles are a common information source for Chinese-language content. The command is reusable for any article URL by changing the `url` parameter.

## Page Structure / Data Source Characteristics

- **Target URL**: Any `https://zhuanlan.zhihu.com/p/{id}` article URL
- **Key Selectors**:
  - Title: `h1` or `.Post-Title`
  - Publish time: `.ContentItem-time`
  - Content: `.RichText`
  - Engagement stats: `.ContentItem-actions` (text extraction via regex)
- **Interaction Sequence**: No interaction needed; data is present in the DOM after page load.

## Environment Dependencies

- Requires `playwright-cli` installed and attached to the user's Chrome/Edge browser (CDP mode).
- User must enable remote debugging in the browser beforehand (`chrome://inspect/#remote-debugging`).
- Public articles do not require authentication, but some may be behind a login wall.

## Failure Signals

- The `.RichText` selector returns null or empty content.
- The page title indicates 404 or access denied.
- Engagement stats cannot be parsed from the actions bar.

## Fix Hints

- Zhihu may rename CSS classes. If `.RichText` breaks, look for alternative content container classes.
- If the article is behind a login wall, consider adding authentication handling or switching to an API-based approach.
