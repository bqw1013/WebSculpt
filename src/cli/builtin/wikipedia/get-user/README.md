# wikipedia/get-user

Fetch a Wikipedia editor's public account statistics by username or user-page URL.

## Description

Given a Wikipedia username or a full `User:` page URL, this command returns the editor's public profile data using the MediaWiki Action API. It includes the user ID, total edit count, explicit and implicit groups, rights, registration date, gender preference, and derived flags indicating whether the account is a bot, administrator, or currently blocked.

Null or undefined fields are omitted from the output.

## Parameters

- `user` (required): Wikipedia username (e.g. `{username}`) or full URL `https://{lang}.wikipedia.org/wiki/User:{username}`.
- `language` (optional): Language edition code. Default is `zh`. Common values include `zh`, `en`, `ja`, `ko`, `fr`, `de`, `es`, `ru`; any valid MediaWiki language code works.

## Return Value

```json
{
  "name": "{username}",
  "url": "https://{lang}.wikipedia.org/wiki/User:{username}",
  "language": "{lang}",
  "userid": 12345,
  "editcount": 1234567,
  "groups": ["*", "user", "autoconfirmed"],
  "implicitgroups": ["*", "user", "autoconfirmed"],
  "rights": ["read", "edit", "createpage"],
  "registration": "YYYY-MM-DDTHH:MM:SSZ",
  "gender": "unknown",
  "is_bot": false,
  "is_admin": false,
  "is_blocked": false,
  "blockinfo": {
    "blockedby": "{admin}",
    "blockedtimestamp": "YYYY-MM-DDTHH:MM:SSZ",
    "blockreason": "{reason}"
  }
}
```

Fields marked optional in the description are omitted when no value is available. `blockinfo` and `is_blocked` appear only when the user is currently blocked.

## Usage

```bash
websculpt wikipedia get-user --user "{username}"
websculpt wikipedia get-user --user "https://{lang}.wikipedia.org/wiki/User:{username}" --language en
```

## Common Error Codes

- `INVALID_PARAM`: Missing or invalid parameter (e.g. empty username or malformed URL).
- `NOT_FOUND`: The requested user does not exist or the username is invalid.
- `EMPTY_RESULT`: The API returned no usable user data.
- `NETWORK_ERROR`: Cannot reach Wikipedia (often needs a suitable egress path in restricted networks).
- `RATE_LIMITED`: Rate limited by Wikipedia after retries.
