# Context

## Precipitation Background (Why This Command Exists)

Wikipedia is a core public knowledge base for content analysis and daily briefing scenarios. The command library had no Wikipedia commands. This command captures the validated path for reading a single article's full structured content (summary, body, infobox, categories, related links, multilingual versions, image, last editor) via the public MediaWiki API.

## Value Assessment

High reuse value. Article detail is the foundational building block for many downstream tasks: content summarization, topic expansion via related links, cross-language research, and change monitoring via `last_edited`. Parameterized by `title`, `language`, and `include` scope, it generalizes across all Wikipedia language editions.

## Page Structure

- REST summary: `https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}`
- Action API: `https://{lang}.wikipedia.org/w/api.php?action=query&prop=extracts|categories|links|langlinks|info|revisions|pageimages&titles={title}&format=json`
- Parse HTML (for infobox): `https://{lang}.wikipedia.org/w/api.php?action=parse&prop=text&page={title}&format=json`
- Infobox selector in parse HTML: `table.infobox`.
  - Two-cell rows => key/value.
  - Single `th[colspan]` => section header.

## Environment Dependencies

- Requires outbound internet access to `{lang}.wikipedia.org`.
- Network access to Wikimedia servers may require a suitable egress path depending on the operator's location.
- No login required.
- All API requests include an identifying caller header per Wikimedia policy.

## Failure Signals

- `NOT_FOUND`: Action API page object contains `missing` key, or `action=parse` returns `error.code = "missingtitle"`.
- `NETWORK_ERROR`: Connection timeout/failure to Wikipedia servers.
- `RATE_LIMITED`: HTTP 429 or repeated failures.
- `DRIFT_DETECTED` (future): Infobox table class changes from `infobox`, or Action API response shape changes.

## Repair Clues

- If `action=parse` HTML no longer contains `table.infobox`, consider switching the infobox source to browser-rendered DOM (already validated as feasible).
- If REST summary is unreliable, fall back to Action API `prop=extracts` for summary and `prop=pageimages` for image.
- If `prop=links` pagination becomes necessary, implement `plcontinue` continuation.
