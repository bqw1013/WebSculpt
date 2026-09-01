# Context

## Precipitation Background (Why This Command Exists)

Wikipedia categories are a core discovery entry point. This command lets users browse category members programmatically for topic research and content collection via the public MediaWiki Action API.

## Value Assessment

The command is reusable across any Wikipedia language edition and any public category. It saves manual browsing and provides stable structured output for downstream analysis.

## Page Structure

Primary data source is the MediaWiki Action API:

```
https://{lang}.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:{name}&cmtype={type}&cmlimit={limit}&format=json
```

Response fields used:
- `query.categorymembers[].title`
- `query.categorymembers[].type` (`page`, `subcat`, `file`)
- `continue.cmcontinue` for pagination

## Environment Dependencies

- Public internet access to `{lang}.wikipedia.org`.
- A descriptive `User-Agent` header is sent to comply with MediaWiki API conventions.
- In restricted network environments, a suitable egress path is required at the system or network level.
- No login required.

## Failure Signals

- API response missing `query.categorymembers` indicates drift.
- HTTP 429 maps to `RATE_LIMITED`.
- Network exceptions map to `NETWORK_ERROR`.
- Empty `categorymembers` array maps to `EMPTY_RESULT`.

## Repair Clues

- If `type=all` stops returning all three kinds, verify that `cmtype=page|subcat|file` still works and that `cmprop` still includes `type`.
- If category URL parsing breaks, verify that Wikipedia still uses `/wiki/Category:{name}` paths.
- Fallback path validated in explore: browser category page selectors are documented in evidence.md.
