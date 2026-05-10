# Context

## Precipitation Background (Why This Command Exists)

This command was precipitated after a user asked for the current Zhihu hot list.
The existing WebSculpt library only had `zhihu/get-feed`, which targets the personalized home feed and does not return the hot list.
Direct HTTP attempts against Zhihu's hot list API returned authentication errors, and static page fetches hit an anti-crawl challenge.
Browser automation against the rendered `https://www.zhihu.com/hot` page successfully extracted ranked titles, links, and heat values.

## Value Assessment

The command is useful for recurring "what is trending on Zhihu now" requests.
It avoids repeating API discovery, anti-crawl probing, and manual DOM extraction.
The parameter surface is intentionally small: `limit` controls output size while keeping the command focused on the default hot list.

## Page Structure

Entry URL: `https://www.zhihu.com/hot`.

Verified extraction:

- Wait for `main h2`.
- Each hot item title is an `h2`.
- The closest ancestor `a` of the `h2` contains the question URL.
- The heat value is in nearby parent text and matches `/[0-9.]+\s*万热度/`.

## Environment Dependencies

Runtime is `browser`.
The browser session should be able to render Zhihu normally. In practice this may require an existing logged-in session or a browser state trusted by Zhihu.
The command only reads the hot list page and does not click, post, follow, vote, or transmit user data.
Do not solve CAPTCHA or bypass a safety challenge in the command.

## Failure Signals

Expected failure signals:

- `main h2` never appears: blocked page, not logged in, loading failure, or page structure drift.
- Items exist but URLs are missing: link structure drift.
- Items exist but all heat values are missing: heat text structure drift.
- Empty extraction after waiting: list structure changed or access blocked.

## Repair Clues

First verify the rendered page manually with a browser session at `https://www.zhihu.com/hot`.
If `main h2` changes, inspect the hot card container and update the selector to target the new title element.
If heat text changes, update the regular expression while preserving the return field name `hot`.
If Zhihu exposes a stable browser-accessible API in network requests, consider switching to that endpoint only after validating authentication and anti-crawl behavior.
