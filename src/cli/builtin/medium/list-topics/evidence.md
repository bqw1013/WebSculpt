# Evidence: medium/list-topics

This document records the research and validation evidence for the `medium/list-topics` command.

## Exploration Path

- Checked the WebSculpt command library for existing medium commands: `websculpt command domains` and `websculpt command list medium`.
- Existing medium commands (`get-staff-picks`, `get-tag-trending`, `search`) do not cover topic directory listing or topic autocomplete.
- Used `@playwright/cli` to attach to the user's Chrome and navigate to `https://medium.com/explore-topics`.
- Verified the topic directory structure and autocomplete behavior via DOM evaluation.

## Verified URLs

- `https://medium.com/explore-topics` — Official Medium topic directory. Loads without login. Contains the "Search all topics" autocomplete input and the categorized topic directory.

## Structural Evidence

### Directory mode (no query)

- The page embeds `window.__APOLLO_STATE__` with `Tag:<slug>` entries.
- `ROOT_QUERY.rootTags` contains the 9 top-level categories:
  - Life, Self Improvement, Work, Technology, Software Development, Media, Society, Culture, World.
- Each `Tag` object has the shape:
  ```json
  {
    "__typename": "Tag",
    "id": "<slug>",
    "displayTitle": "<Human Readable Name>",
    "normalizedTagSlug": "<slug>",
    "childTags": [{ "__ref": "Tag:<child-slug>" }]
  }
  ```
- Tags form a tree: root category → sub-category → leaf topic.
- Verified total: 9 categories, 497 leaf/intermediate topics.
- Topic URL canonical form: `https://medium.com/tag/<slug>`.

### Query mode (autocomplete)

- The "Search all topics" input has placeholder text matching `input[placeholder*="Search all topics"]`.
- Typing triggers a dropdown rendered as `<div id="searchResults" role="listbox">`.
- Each result is an `<a href="/tag/<slug>?source=...">` inside the listbox.
- Stable selector for results: `#searchResults a[href^="/tag/"]`.
- Result shape after stripping query strings: `{ name, slug, url }`.
- Verified queries:
  - `"artificial"` → Artificial Intelligence, Inteligencia Artificial, Artificalintelligence.
  - `"programming"` → Programming, Python Programming, C Sharp Programming.

## Failure Signals

- No login wall observed; page is publicly accessible.
- If the Apollo state is missing or the expected `Tag` structure changes, the command should throw `DRIFT_DETECTED`.
- If autocomplete returns no matches, the `#searchResults` element is not rendered; command returns an empty array `[]`.
- Browser attach failures surface as `BROWSER_ATTACH_REQUIRED` from the runner, not from command code.

## Capture Assessment

This path should be captured as `medium/list-topics`.

- The directory data is stable and embedded in the initial HTML via Apollo state.
- Autocomplete is a standard page input with a predictable dropdown selector.
- No API key or login is required.
- The command fills a clear gap in the existing medium command set and provides slugs/URLs needed by `medium/get-topic-trending` and `medium/get-topic-info`.
