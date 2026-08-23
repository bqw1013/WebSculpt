# Context

## Precipitation Background (Why This Command Exists)

Medium commands in the library (`get-staff-picks`, `get-tag-trending`, `search`) all operate on stories or require the caller to already know a topic slug. There was no command to discover topic slugs from Medium's official topic directory. This command fills that gap by exposing the `/explore-topics` page as a structured data source.

## Value Assessment

- High reuse value: every downstream Medium topic command needs a slug, and slugs are not always obvious from the UI display name.
- Low maintenance: the directory is public, requires no login, and the data is embedded in the initial Apollo state.
- Two usage patterns in one command: full directory browsing and quick autocomplete lookup.

## Page Structure

- URL: `https://medium.com/explore-topics`
- Directory data source: `window.__APOLLO_STATE__`.
  - `ROOT_QUERY.rootTags` -> array of `{__ref: "Tag:<slug>"}` for the 9 top-level categories.
  - Each `Tag:<slug>` entry has `displayTitle`, `normalizedTagSlug`, and optional `childTags`.
- Autocomplete:
  - Input selector: `input[placeholder*="Search all topics"]`
  - Result container selector: `#searchResults` (rendered after typing)
  - Result links: `#searchResults a[href^="/tag/"]`

## Environment Dependencies

- Requires Chrome or Edge with remote debugging enabled.
- No login required.
- The page is public and static for directory mode; autocomplete requires a small client-side delay after typing.

## Failure Signals

- Apollo state missing or `ROOT_QUERY.rootTags` absent -> `DRIFT_DETECTED`.
- Autocomplete returns no matches -> `#searchResults` is not rendered; command returns empty `topics` array.
- Browser not reachable -> runner returns `BROWSER_ATTACH_REQUIRED`.

## Repair Clues

- If Apollo state structure changes, fall back to parsing the DOM `a[href^="/tag/"]` links grouped by `h2` headings. This was explored but Apollo state is preferred for stability and de-duplication.
- If autocomplete selector breaks, inspect the search input's `aria-controls` or `role="listbox"` attribute for the new container id.
