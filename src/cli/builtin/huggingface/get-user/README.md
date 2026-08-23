# huggingface/get-user

## Description

Fetch a Hugging Face user or organization profile: display name, PRO flag, follower/following counts, avatar URL, and the profile's published models plus dataset and Space counts.

## Parameters

- `user` (string, required): HF username or organization name, e.g. `deepseek-ai` or `HuggingFaceFW`.

## Return Value

```json
{
  "username": "<hf-user>",
  "display_name": "<display name>",
  "is_pro": true,
  "followers": 12,
  "following": 34,
  "profile_url": "https://huggingface.co/<hf-user>",
  "avatar_url": "https://huggingface.co/avatars/<avatar-hash>.svg",
  "models": [ { "id": "<hf-user>/<model-name>", "likes": 0, "downloads": 0 } ],
  "dataset_count": 3,
  "space_count": 5
}
```

Notes:
- `following` is `null` for organizations (orgs do not expose a following count on the profile page).
- `models` is capped at 1000 entries (one API page); counts reflect the full list length.
- Profile fields (display_name / is_pro / followers / following / avatar_url) are read from the profile page DOM; models / dataset_count / space_count come from HF's internal author API (`/api/models?author=`, `/api/datasets?author=`, `/api/spaces?author=`) via in-page fetch.

## Usage

```
websculpt huggingface get-user --user HuggingFaceFW
websculpt huggingface get-user --user deepseek-ai
```

## Common Error Codes

- `MISSING_PARAM` — `user` is empty.
- `INVALID_PARAM` — `user` contains `/` (a repo id, not a username/organization name).
- `NOT_FOUND` — the user or organization does not exist (404 page).
- `NETWORK_ERROR` — the HF author API request failed.
- `BROWSER_ATTACH_REQUIRED` — browser not connected (raised by the daemon).
