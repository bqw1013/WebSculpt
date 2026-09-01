# Evidence: wikipedia/get-news

This document records the research and validation evidence for the `wikipedia/get-news` command.

## Exploration Path

- Checked the WebSculpt command library: no `wikipedia` domain exists, and no reusable command is available.
- Confirmed the node runtime contract before implementing `command.js`.
- Verified the MediaWiki `action=parse&prop=text` API in zh/en/ja via browser-assisted network access (direct curl timed out due to network restrictions).
- Compared the API-rendered HTML against the live browser page DOM; both carry the same content markup inside `.mw-parser-output`.

## Verified URLs

- `https://zh.wikipedia.org/w/api.php?action=parse&page=Portal:%E6%96%B0%E8%81%9E%E5%8B%95%E6%85%8B&prop=text&format=json`
- `https://zh.wikipedia.org/wiki/Portal:%E6%96%B0%E8%81%9E%E5%8B%95%E6%85%8B`
- `https://en.wikipedia.org/w/api.php?action=parse&page=Portal:Current_events&prop=text&format=json`
- `https://en.wikipedia.org/wiki/Portal:Current_events`
- `https://ja.wikipedia.org/w/api.php?action=parse&page=Portal:%E6%9C%80%E8%BF%91%E3%81%AE%E5%87%BA%E6%9D%A5%E4%BA%8B&prop=text&format=json`
- `https://ja.wikipedia.org/wiki/Portal:%E6%9C%80%E8%BF%91%E3%81%AE%E5%87%BA%E6%9D%A5%E4%BA%8B`

## Structural Evidence

- The API response shape is `{ parse: { title, pageid, text: { "*": "<div class=\"mw-parser-output\">...</div>" } } }`.
- `prop=wikitext` returns raw templates (`{{Excerpt|...}}`) and is not directly usable; `prop=text` returns expanded HTML.
- **zh** (`Portal:新聞動態`): date headings are `<h2>` with text like `M月D日`. Each date heading corresponds by index to a `<div class="excerpt-block">` containing `<div class="excerpt">`, which contains `<ul><li>` news items. Each `<li>` holds event text and `<a title="..." href="/wiki/...">` article links.
- **en** (`Portal:Current_events`): news items are under a single `<h2>` titled `Topics in the news`, followed by a flat `<ul>` of `<li>` items. No per-date grouping exists.
- **ja** (`Portal:最近の出来事`): month headings are `<h2>`; date headings are `<h3>` with text like `YYYY年M月D日`. Each `<h3>` is immediately followed by a `<ul>` of `<li>` items.
- Internal article links use `/wiki/` paths and carry a `title` attribute. Citation links use `#cite_note-*` anchors and must be filtered out.

## Failure Signals

- API returns HTTP 200 with `{ error: { code: "missingtitle", ... } }` when the news portal page does not exist.
- API returns `{ error: { code: "badvalue", ... } }` for invalid action parameters.
- No network reachability to `{lang}.wikipedia.org` produces a connection-level failure (`NETWORK_ERROR`).
- If the rendered HTML no longer contains recognized date headings, `.excerpt-block`, or a `Topics in the news` section, the parser returns an empty result (`EMPTY_RESULT` / `DRIFT_DETECTED` candidate).

## Capture Assessment

This command should be captured. The MediaWiki Action API is stable, requires no authentication, and the rendered HTML structure is regular enough to parse with lightweight string utilities. The command provides reusable value for daily news aggregation across multiple Wikipedia language editions.
