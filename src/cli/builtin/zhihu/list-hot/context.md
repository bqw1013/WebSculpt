# Context

## Background

This command captures the Zhihu Hot List (https://www.zhihu.com/hot), which is client-side rendered and requires browser automation to extract data reliably.

## Value Assessment

Medium to high. The Zhihu Hot List is a frequently referenced source for trending topics in Chinese-speaking communities. The `limit` parameter allows flexible reuse without modification.

## Page Structure / Data Source Characteristics

- **Target URL**: `https://www.zhihu.com/hot`
- **Key Selectors**:
  - Entry links: `section a[href*='question']` and `section a[href*='zhuanlan']`
  - Heat value: extracted via regex `(\d+\s*万?\s*热度)` from the closest container
- **Interaction Sequence**: No interaction needed; data is present in the DOM immediately after page load.

## Environment Dependencies

- Requires `playwright-cli` installed and attached to the user's Chrome/Edge browser (CDP mode).
- User must enable remote debugging in the browser beforehand (`chrome://inspect/#remote-debugging`).
- The Zhihu Hot page is public and **does not require authentication**.
- Keep access frequency reasonable to avoid triggering anti-bot measures.

## Failure Signals

- The selector `section a[href*='question']` returns an empty NodeList while the page has finished loading.
- All extracted entries have an empty `title` field.
- The page title indicates an error or redirect.

## Fix Hints

- Zhihu may change frontend class names or DOM structure. If the current selectors break, inspect the hot list container for alternative attributes.
- If Zhihu moves hot list data to an API-driven model, consider switching to the `node` runtime + `fetch` to call internal APIs.
