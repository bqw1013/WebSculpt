# Evidence: zhihu/get-hot

This document records the research and validation evidence for the `zhihu/get-hot` command.

## Exploration Path

Command library check was completed with `websculpt command list`.
The existing `zhihu/get-feed` command only covers the personalized Zhihu home feed and requires a logged-in browser session; it does not cover the public hot list page.

The browser exploration guide was read before using browser automation. A Chrome session was already attached through `playwright-cli list` as `default`, status `open`, browser type `chrome`.
The verified extraction used a temporary tab opened with `playwright-cli tab-new "https://www.zhihu.com/hot"`, then a DOM snapshot and a page evaluation. The temporary tab was closed after extraction.

## Verified URLs

- https://www.zhihu.com/hot

## Structural Evidence

The rendered hot list is visible under the page `main` element after the browser session loads `https://www.zhihu.com/hot`.

Verified extraction expression:

```js
Array.from(document.querySelectorAll("main h2")).slice(0, 20).map((h, i) => ({
  rank: i + 1,
  title: h.innerText,
  url: h.closest("a")?.href,
  hot: h.closest("a")?.parentElement?.innerText.match(/[0-9.]+\s*万热度/)?.[0] || ""
}))
```

Sample verified output structure (titles are anonymized placeholders):

```json
[
  {
    "rank": 1,
    "title": "如何看待某行业从业者涉嫌违规被调查，涉案金额引发广泛讨论？",
    "url": "https://www.zhihu.com/question/1234567890123456789",
    "hot": "2013 万热度"
  },
  {
    "rank": 2,
    "title": "某城市出租车与网约车服务争议事件，引发公众对服务标准的关注？",
    "url": "https://www.zhihu.com/question/9876543210987654321",
    "hot": "946 万热度"
  }
]
```

Observed DOM facts:

- The question title is rendered as an `h2` inside a link.
- The question URL is available from the closest ancestor link of each `h2`.
- The heat value appears in the parent text near each title and matches the pattern `[0-9.]+ 万热度`.
- The page may show a logged-in title such as "首页 - 知乎", but the URL remains `https://www.zhihu.com/hot` and the hot list content is rendered in `main`.

## Failure Signals

- Direct unauthenticated API access to `https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20` returned `AuthenticationError`, so this command should rely on browser rendering instead of the API.
- Direct `curl` access to `https://www.zhihu.com/hot` returned a `zse_ck` anti-crawl challenge page in one attempt, so the command requires a real browser runtime.
- If no `main h2` elements are found after navigation, the page is likely blocked, not logged in, still loading, or has changed structure.
- If title extraction succeeds but URL or heat extraction is missing for all items, the DOM structure has likely drifted.
- The command should not solve CAPTCHA or bypass a safety challenge. It should return a structured error when the rendered list is unavailable.

## Capture Assessment

Capture is recommended as `zhihu/get-hot`.
The path is reusable for the recurring question "what is on Zhihu hot list now" and can return structured hot list items with rank, title, URL, and heat.
Runtime should be `browser` because the official API required authentication and direct static requests encountered anti-crawl behavior, while the browser-rendered page successfully produced the desired data.
