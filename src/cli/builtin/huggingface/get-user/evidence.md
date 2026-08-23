# Evidence: huggingface/get-user

This document records the research and validation evidence for the `huggingface/get-user` command.

## Exploration Path

- Command library check: no existing user/org profile command in `huggingface`; this is a new command (no conflict). Related batch commands share the `/api/*?author=` path with `list-models`.
- Capture contract consulted: `references/browser-contract.md` (browser runtime).
- `explore assess` status = passed, capture eligible = yes (prior explore workspace).
- Verified decision: HF has no profile API (`/api/users/{name}` and `/api/orgs/{name}` both return 404). Profile fields must be extracted from the `/huggingface.co/{user}` page DOM; output data comes from the author-filtered list APIs via in-page fetch.

## Verified URLs

- `https://huggingface.co/<hf-user>` — user profile (self): h1=`<display name> PRO`, followers=`<n>`, following=`<n>`, avatar `https://huggingface.co/avatars/<avatar-hash>.svg`; models=`<n>`, datasets=`<n>`, spaces=`<n>`.
- `https://huggingface.co/sayakpaul` — user profile: h1=`Sayak Paul PRO`, `1,026 followers` / `63 following`, avatar `https://cdn-avatars.huggingface.co/v1/production/uploads/1649681653581-5f7fbd813e94f16a85448745.jpeg`; models=27, datasets=26, spaces=17.
- `https://huggingface.co/deepseek-ai` — org profile: h1=`DeepSeek` (plain text, no PRO badge), follower count 140,946 embedded in the Follow button, no following button; models=102, datasets=2, spaces=5.
- `https://huggingface.co/this-user-does-not-exist-xyz` — 404 page: title=`404 – Hugging Face`, h1=`404`.
- In-page fetch APIs (all returned 200 with a JSON array): `https://huggingface.co/api/models?author={user}&limit=1000`, `https://huggingface.co/api/datasets?author={user}&limit=1000`, `https://huggingface.co/api/spaces?author={user}&limit=1000`.

## Structural Evidence

- User profile h1: `<h1 class="mb-0.5 flex items-center ..."><a href="/{user}" title="{display name}"><span class="mr-2 leading-6">{display name}</span></a> <a href="/pro" class="flex"><span class="...">PRO</span></a></h1>`.
- Org profile h1: `<h1 class="mb-2 mr-3 text-2xl font-bold md:mb-0">DeepSeek</h1>` (no `a[title]`, no PRO badge).
- display_name: `h1 a[title]` `title` attribute for users; fallback to `h1` text (PRO suffix stripped) for orgs.
- is_pro: presence of `h1 a[href="/pro"]`.
- followers (users): `button.hover:underline` whose text matches `/^[\d,.]+[\s]*followers$/`.
- following (users): `button.hover:underline` whose text matches `/^[\d,.]+[\s]*following$/`.
- followers (orgs): a `[title*="followers"]` span inside the Follow button (e.g. `title="Show DeepSeek's followers"` containing `140,946`); no following button exists for orgs (following=null).
- avatar: `img[alt*="picture"]` `src` (either `cdn-avatars.huggingface.co/...` or `huggingface.co/avatars/...`).
- og:title meta = `{username} ({display name})` for profiles; contains a `/` for repo/dataset/space pages (used as a profile-vs-repo discriminator).
- No embedded JSON globals (`__NEXT_DATA__`, `__INITIAL_STATE__`, etc.); profile data is Svelte client-rendered.
- API: `/api/models?author={user}&limit=1000` returns an array whose items include `id`, `likes`, `downloads`; `/api/datasets?author=` and `/api/spaces?author=` return arrays whose length is the count. `limit=1000` (and up to at least 5000) returns the full set; pagination is cursor-based with no total-count header.

## Failure Signals

- 404 page: `document.title` contains `404` or `h1` text starts with `404` → NOT_FOUND.
- Non-profile input (e.g. a repo id like `org/name`): `og:title` or h1 display text contains `/` → treat as NOT_FOUND.
- Author API returns a non-200 status → NETWORK_ERROR.
- Empty `user` param → MISSING_PARAM.
- Browser not connected → `BROWSER_ATTACH_REQUIRED` (raised by the daemon, not the command).
- Polite pacing gestures (scroll/mouse move) are best-effort and must never fail the command.

## Capture Assessment

This command should be captured. The explore phase verified a stable, parameterized path for fetching any HF user/organization's profile identity (display name, PRO flag, follower/following counts, avatar) and their published models, dataset count, and Space count. It generalizes to any `user` value, requires no login, and fills a real gap in the HF command family (no existing profile command). The path was validated end-to-end in the explore phase on three real profiles (user, self-user, org) and one 404 page.
