# Context

## Background

This command was captured to extract article lists from Zhihu user post pages, which are client-side rendered and require browser automation.

## Page Structure / Data Source Characteristics

- **Target URL**: `https://www.zhihu.com/people/{userId}/posts`
- **Key Selectors**:
  - Primary: `.Profile-main .ContentItem.ArticleItem`
  - Fallback: `.Profile-main .List-item`
  - Title link: `.ContentItem-title a`
- **Interaction Sequence**: No interaction needed after page load.

## Environment Dependencies

- Requires `playwright-cli` installed and attached to the user's Chrome/Edge browser (CDP mode).
- User must enable remote debugging in the browser beforehand (`chrome://inspect/#remote-debugging`).
- Public profiles do not require authentication, but some may be behind a login wall.

## Failure Signals

- URL redirect away from the user ID path indicates non-existent user.
- `.SignFlowModal` or `.Modal-wrapper--fill` presence indicates authentication wall.
- `.ProfileHeader` selector missing indicates invalid or unloaded page.
- Both primary and fallback selectors return empty results.

## Fix Hints

- Zhihu may change article list container classes. If `.ContentItem.ArticleItem` breaks, try broader selectors like `.List-item`.
- If the page moves to infinite scroll / API-driven loading, consider adding scroll interactions or switching to internal APIs.
- The `domcontentloaded` wait strategy is intentionally used instead of `networkidle` to avoid hanging on Zhihu's background tracking requests.
