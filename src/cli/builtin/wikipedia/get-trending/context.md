# Context

## Precipitation Background (Why This Command Exists)

Wikipedia does not have a single official "trending" page that is consistent across languages. The Wikimedia Foundation exposes daily top pageview data through the public Pageviews API. This command wraps that API so users can quickly obtain ranked lists of popular articles for content monitoring and trend analysis.

## Value Assessment

- Generality: works for any Wikipedia language edition supported by MediaWiki.
- Reuse frequency: high for daily/weekly trend reports.
- Time saved: avoids manual date arithmetic, multi-day API aggregation, and namespace filtering.

## Page Structure

Primary data source is an API endpoint, not a page:

```
GET https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{lang}.wikipedia/all-access/{yyyy}/{mm}/{dd}
```

Response field path: `items[0].articles` → `{ article, views, rank }`.

Browser equivalents were evaluated during explore but rejected:
- `pageviews.wmcloud.org/topviews` does not accept direct date parameters.
- `zh.wikipedia.org/wiki/Wikipedia:动态热门` only shows one day for zh and numbers differ from the API.
- `en.wikipedia.org/wiki/Wikipedia:Top_25_Report` is a manually curated weekly top 25.
- `ja.wikipedia.org/wiki/Wikipedia:人気記事` had no usable data table.

## Environment Dependencies

- Public internet access to `wikimedia.org`.
- In restricted network environments, a suitable egress path is required.
- The command reads standard proxy-related environment variables.
- No login or API key required.
- Requests include an identifying caller header and a 200–700 ms random delay between day-level calls.

## Failure Signals

- API returns HTTP 404 with structured body when a date has no data or the project is invalid.
- Connection timeout / TLS failure when an egress path is missing.
- If all days in the requested window return 404, the command emits `NOT_FOUND`.
- If every returned title is filtered out as a non-mainspace page, the command emits `EMPTY_RESULT`.

## Repair Clues

- If the API shape changes (e.g. `items[0].articles` no longer exists), update `command.js` parsing and bump evidence.
- If Wikimedia starts rejecting the identifying caller header, switch to a more generic identifying string.
- If proxy-related environment variables are insufficient, consider adding an `egress` parameter in a future revision.
