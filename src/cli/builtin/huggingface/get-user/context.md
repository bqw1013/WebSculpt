# Context

## Precipitation Background (Why This Command Exists)

- Part of the Hugging Face command batch. A prior explore workspace passed assess.
- Gap: no existing HF command returns a user/org profile. Plan section 7 defined `huggingface/get-user`.
- Need: given a username or organization name, return profile identity (display name, PRO flag, follower/following counts, avatar) and published outputs (models list, dataset count, Space count).

## Value Assessment

- High reuse value: common task, generalizes to any username/org name, no login required.
- Browser network is mandatory: CLI/node cannot reach huggingface.co; the command reuses the user's browser network via in-page fetch.
- Shares the `/api/*?author=` output path with `list-models` (author filter).

## Page Structure

- Profile page: `https://huggingface.co/{user}` (Svelte client-rendered; no embedded JSON globals, no dedicated profile API — `/api/users/{name}` and `/api/orgs/{name}` are 404).
- display_name: `h1 a[title]` title attribute (users); fallback `h1` text with trailing `PRO` stripped (orgs).
- is_pro: `h1 a[href="/pro"]` presence.
- followers: users → `button.hover:underline` matching `/^[\d,.]+ followers$/`; orgs → `[title*="followers"]` span inside the Follow button.
- following: users → `button.hover:underline` matching `/^[\d,.]+ following$/`; orgs → `null`.
- avatar: `img[alt*="picture"]` src.
- Output API: `/api/models?author={u}&limit=1000` (items have id/likes/downloads), `/api/datasets?author={u}&limit=1000`, `/api/spaces?author={u}&limit=1000` (array length = count).

## Environment Dependencies

- `browser` runtime; requires Chrome/Edge running with remote debugging enabled; no login required (public data).
- Polite pacing (user hard requirement): light random scroll + mouse move + random wait per call; kept well under the ≤10s single-call target.
- HF command batch runs 4 commands' capture in parallel; keep calls serial and spaced to avoid tripping rate limits.

## Failure Signals

- 404 page: title contains `404` or h1 starts with `404` → NOT_FOUND.
- Non-profile input (repo id with `/`): og:title or h1 contains `/` → NOT_FOUND.
- Author API non-200 → NETWORK_ERROR.
- Empty `user` → MISSING_PARAM.
- Browser not connected → BROWSER_ATTACH_REQUIRED (daemon-raised).

## Repair Clues

- If HF changes the profile DOM, re-verify h1 / follower button / avatar selectors via explore before editing extraction.
- If `/api/models?author=` response shape changes, re-check `id`/`likes`/`downloads` fields.
- If follower/following buttons are restructured, fall back to the `[title*="followers"]` span or Follow-button text.
