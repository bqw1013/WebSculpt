# Context

## Background

This command was captured to extract structured profile data from Zhihu user pages (www.zhihu.com/people/{userId}), which are client-side rendered and require browser automation.

## Page Structure / Data Source Characteristics

- **Target URL**: `https://www.zhihu.com/people/{userId}`
- **Key Selectors**:
  - Name: `h1` (first non-blacklisted text node)
  - Headline: `h1` second line or line following name
  - Location: text line starting with `现居`
  - IP location: text line starting with `IP 属地`
  - Industry: line following `所在行业`
  - Education: lines containing ` · ` after `教育经历`
  - Content counts: text lines matching tab labels (e.g., `回答123`, `文章45`)
  - Follower count: numeric value near `关注者` keyword via TreeWalker
  - Followee count: numeric value near `关注了` keyword via TreeWalker
  - Voteup/thanked/favorite counts: regex matches on page text (`次赞同`, `次喜欢`, `次收藏`)
- **Interaction Sequence**: Clicks "查看详细资料" button to expand profile details if present.

## Environment Dependencies

- Requires `playwright-cli` installed and attached to the user's Chrome/Edge browser (CDP mode).
- User must enable remote debugging in the browser beforehand (`chrome://inspect/#remote-debugging`).
- Public profiles do not require authentication, but some fields may be hidden.

## Failure Signals

- `h1` or body text does not contain identifiable user name.
- All numeric stats (followerCount, voteupCount) are null.
- Page title contains 404 indicators.

## Fix Hints

- Zhihu frequently changes frontend class names. If selectors break, rely on text content matching (e.g., keywords like `关注者`, `次赞同`) as a more stable fallback.
- If the profile page moves to an API-driven model, consider switching to `node` runtime + internal API calls, but be mindful of authentication requirements.
- The "查看详细资料" expansion button may change text or behavior; verify its presence before relying on the click interaction.
