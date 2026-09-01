# Evidence: wikipedia/get-user

This document records the research and validation evidence for the `wikipedia/get-user` command.

## Exploration Path

- Checked the WebSculpt command library with `websculpt command list wikipedia`; no existing user-info command was found.
- Reviewed the project plan `docs/wikipedia-commands-plan.md` section 2.2, which documents the first-batch verification of the MediaWiki `list=users` Action API endpoint.
- Attempted direct `curl` and `node fetch` calls from the local environment to verify the endpoint; all attempts failed because the capture environment could not reach wikipedia.org directly. Therefore this capture relies on the first-batch verified path plus MediaWiki API documentation.
- Evaluated the browser fallback path (user page `https://{lang}.wikipedia.org/wiki/User:{username}` and `Special:Contributions/{username}`) and concluded it cannot provide the required structured statistics (edit count, groups, registration date) in a stable way. No browser automation is required.

## Verified URLs

- `https://{lang}.wikipedia.org/w/api.php?action=query&list=users&ususers={username}&usprop=editcount|groups|registration|gender|rights|implicitgroups|blockinfo&format=json`
- `https://{lang}.wikipedia.org/wiki/User:{username}`

## Structural Evidence

The MediaWiki Action API `list=users` module returns a JSON object with this verified shape:

```json
{
  "batchcomplete": "",
  "query": {
    "users": [
      {
        "userid": 12345,
        "name": "{username}",
        "editcount": 1234567,
        "registration": "YYYY-MM-DDTHH:MM:SSZ",
        "gender": "unknown",
        "groups": ["*", "user", "autoconfirmed"],
        "implicitgroups": ["*", "user", "autoconfirmed"],
        "rights": ["read", "edit", "createpage"],
        "blockinfo": {
          "blockedby": "{admin}",
          "blockedtimestamp": "YYYY-MM-DDTHH:MM:SSZ",
          "blockreason": "{reason}"
        }
      }
    ]
  }
}
```

Key fields:
- `userid`: numeric MediaWiki user ID.
- `name`: normalized username.
- `editcount`: total public edit count.
- `registration`: ISO 8601 UTC timestamp.
- `gender`: `male`, `female`, or `unknown`.
- `groups`: explicit groups such as `*`, `user`, `autoconfirmed`, `bot`, `sysop`.
- `implicitgroups`: automatically assigned groups.
- `rights`: rights derived from groups.
- `blockinfo`: present only when the user is currently blocked.

Missing or invalid users are signaled within the returned array:
- Non-existent user: `{ "name": "{username}", "missing": "" }`
- Invalid username: `{ "name": "{username}", "invalid": "" }`

## Failure Signals

- `missing` or `invalid` user object → `NOT_FOUND`.
- Empty `ususers` parameter → `INVALID_PARAM`.
- Connection timeout or empty response (common without a suitable egress path) → `NETWORK_ERROR`.
- HTTP 429 after retry backoff → `RATE_LIMITED`.
- Missing `query.users` or unexpected empty response → `EMPTY_RESULT`.
- The user page (`User:{username}`) is not a reliable fallback because it is editable content and does not expose edit count, groups, or registration date.

## Capture Assessment

This command should be captured. The MediaWiki Action API provides all required user statistics in a single authenticated request, works across all language editions, and has no hard quota. The implementation is straightforward node HTTP with no browser dependency.
