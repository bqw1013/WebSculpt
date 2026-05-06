# Context

## Background

This command was captured to extract recent activities from Zhihu user pages, which aggregates pins, answers, and articles in a single timeline.

## Value Assessment

Medium. Activity timeline extraction is useful for monitoring user engagement and content output. Reusable for any public user by changing the `userId` parameter.

## Page Structure / Data Source Characteristics

- **Target URL**: `https://www.zhihu.com/people/{userId}/activities`
- **Key Selectors**:
  - Activity items: `.List-item`
  - Activity type: `.ActivityItem-metaTitle`
  - Activity time: `.ActivityItem-meta span:last-child`
  - Content title: `.ContentItem-title`
  - Content preview: `.RichContent-inner`
  - URL links: `a[href*="/pin/"]`, `a[href*="/p/"]`, `a[href*="/question/"]`
- **Interaction Sequence**: No interaction needed after page load.

## Environment Dependencies

- Requires `playwright-cli` installed and attached to the user's Chrome/Edge browser (CDP mode).
- User must enable remote debugging in the browser beforehand (`chrome://inspect/#remote-debugging`).
- Some user activity pages may require login; public pages of active users are usually accessible.

## Failure Signals

- URL redirect away from the user ID path indicates non-existent user.
- `.SignFlowModal` or `.Modal-wrapper--fill` presence indicates authentication wall.
- `.List-item` selector returns empty NodeList.
- All extracted activities have empty type and title.

## Fix Hints

- If `.List-item` breaks, look for alternative list container classes.
- If the auth wall becomes more aggressive, consider adding cookie-based authentication or switching to internal APIs.
- Activity type labels (e.g., `赞同了回答`, `发布了文章`) are page text and should be preserved in output as-is.
