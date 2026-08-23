# Context

## Precipitation Background (Why This Command Exists)

Spotify category ids are opaque 22-character strings that cannot be guessed. `spotify/get-category` needs a `--genre-id`, and the only way to discover valid ids is to list the category tree. This command extracts the tree from the "所有播客类别" page (`/genre/0JQ5DArNBzkmxXHCqFLx2U`).

## Value Assessment

- Discovery entry for `spotify/get-category`; enables browsing podcasts by vertical (喜剧/教育/体育/真实案件…).
- Single page load, no pagination, no login — cheap and fast.
- 43 categories with a stable DOM structure.

## Page Structure

- URL: `https://open.spotify.com/genre/0JQ5DArNBzkmxXHCqFLx2U`
- 8 `[data-testid="component-shelf"]` shelves; each shelf = one top-level group.
- Inside each shelf: a flat grid (`[role="list"]`) of `[role="listitem"]` cards, each with one `a[href="/genre/{genreId}"]`.
- Hierarchy convention: the first card in a shelf is top-level (`parent: null`); the following cards are children (`parent` = first card's name). DOM is flat; order within the shelf encodes the relationship.
- Exclude non-category genre links: the left-nav "浏览播客" link and the bottom "选择语言" filter links also match `a[href*="/genre/"]` but live OUTSIDE the 8 shelves — scope queries to `[data-testid="component-shelf"]`.
- Read card text via `a.textContent` (raw DOM text), not `innerText` — below-the-fold cards return empty `innerText` but populated `textContent`.
- Category names are localized to the page UI language (explore saw Chinese, the daemon context renders English). genreIds are the stable key; the same real-world category can appear under different top-levels with distinct ids (e.g. the two "Video Games"/电玩 categories).

## Environment Dependencies

- Browser runtime (attach user Chrome); public pages work anonymously, no login required.
- The SPA is heavy: navigate with `waitUntil: "domcontentloaded"` and wait for the shelf selector rather than `load`.
- Polite pacing: minimal extra delay (a single ~1.2s settle after the shelves render); no scrolling is needed.

## Failure Signals

- `[data-testid="component-shelf"]` missing or with no genre links → `DRIFT_DETECTED` (page restructured).
- Zero categories extracted → `EMPTY_RESULT`.
- A cold browser context may briefly show a consent/login interstitial; retrying once the context session is established usually resolves it.

## Repair Clues

- If the shelf selector changes, fall back to extracting all `a[href*="/genre/"]` and filtering out the known nav/language links (or filter by anchor href containing a 22-char id).
- Alternative entry: the podcast hub page `/genre/0JQ5DArNBzkmxXHCqFLx2J` links to this categories page via "查看所有类别".
