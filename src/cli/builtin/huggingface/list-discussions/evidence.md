# Evidence: huggingface/list-discussions

This document records the research and validation evidence for the `huggingface/list-discussions` command.

## Exploration Path

- Command library check: existing huggingface commands were `get-trending` and `get-papers`; no discussion-list or single-discussion command existed. This command is new, complementary to `huggingface/get-discussion`.
- Command-line networking cannot reach huggingface.co (curl HTTP 000 timeout, node https hangs). Verified path: browser runtime + in-page `fetch('/api/...')` reusing the user's Chrome network.
- Explore assess for `huggingface-list-discussions` returned `status: passed`, `candidate: huggingface/list-discussions`, and the contract was confirmed by the user.

## Verified URLs

- `https://huggingface.co/deepseek-ai/DeepSeek-R1/discussions` (discussion list page; SSR-rendered; row format `Title #num opened X ago by username`; pagination `?p=N`; default view is open discussions)
- `https://huggingface.co/datasets/HuggingFaceFW/fineweb` (dataset repo used to validate the dataset discussions endpoint)
- `https://huggingface.co/api/models/deepseek-ai/DeepSeek-R1/discussions?status=open&p=0` -> 200 `{ discussions[], count: 202, numClosedDiscussions: 40 }` (limit/start ignored; `p` pagination works)
- `https://huggingface.co/api/datasets/HuggingFaceFW/fineweb/discussions` -> 200, count=78
- `https://huggingface.co/api/spaces/multimodalart/minimax-h3/discussions` -> 200, count=8
- `https://huggingface.co/api/models/no-such-org-xyz/no-such-repo-abc/discussions` -> 404 `{"error":"Repository not found"}`
- Non-working generic endpoints: `/api/discussions/{repo}` and `/api/discussions?repoId=` -> 404 (no repo-type-agnostic endpoint exists)

## Structural Evidence

- The discussions list page is server-side rendered: no `__NUXT_DATA__`, no `window.__NUXT__`, no JSON script, and zero `/api/` requests on reload. DOM row = `div.relative.h-16.w-full` > `a.group.flex.h-full`; left status icon (open=green, closed=gray). But the stable extraction path is the internal API.
- Type-specific discussions API (page-internal same-origin fetch):
  - Models: `https://huggingface.co/api/models/{repo}/discussions?status=open&p={page}`
  - Datasets: `https://huggingface.co/api/datasets/{repo}/discussions`
  - Spaces: `https://huggingface.co/api/spaces/{repo}/discussions`
  - Response shape: `{ discussions: [], count, start, numClosedDiscussions }`.
- Discussion item fields: `num` (number), `author: { name, fullname, avatarUrl, ... }` (use `name` = username), `repo: { name, type }` (type = `model`|`dataset`|`space`), `title`, `status` (`open`|`draft`|`closed`), `createdAt` (ISO 8601), `isPullRequest` (boolean), `numComments` (comment count), `topReactions`, `numReactionUsers`, `pinned`, `repoOwner`.
- Parameter behavior (verified against `/api/models/deepseek-ai/DeepSeek-R1/discussions`):
  - `limit` and `start` are ignored by the API; it always returns a fixed 50 items per page.
  - Pagination uses `p` (0-based): `p=0` -> nums 255..203, `p=1` -> 202..153, `p=4` -> last 42 items (nums 42..1), `p=5` -> empty. `count` stays the total.
  - `status=closed` -> 40 items, count=40; `status=all` -> 242; no status (default) -> all. `status=open` returns count=202, a mix of `open` (45) and `draft` (5) — draft PRs are visible and treated as open. Default view of the page is open discussions (open + draft).
- URL construction: `https://huggingface.co/{model? '' : '{type}s/'}{repo}/discussions/{num}` — model has no type prefix; dataset -> `datasets/`, space -> `spaces/` (taken from the item's `repo.type`, singular -> plural+s).
- Field cross-validation: DOM shows `by {username}` matching `author.name`; relative time derives from `createdAt`; comment count is not rendered in the DOM row, so `numComments` is authoritative.

## Failure Signals

- Repo does not exist (all three type endpoints return 404 `{"error":"Repository not found"}`) -> `NOT_FOUND`.
- Repo exists but has zero open discussions (`status=open` returns `{ discussions: [], count: 0 }`) -> `EMPTY_RESULT` (aligned with the `list-models` family convention).
- `params.repo` missing or not `org/name` (or full URL) -> `MISSING_PARAM` / `INVALID_PARAM` before any network call.
- `params.limit` not a pure integer in 1-100 -> `INVALID_PARAM` before any network call.
- `page.goto` to huggingface.co or in-page fetch failure -> `NETWORK_ERROR` (wrapped).
- HF rate limiting under rapid repeated calls (429/403/CAPTCHA) surfaces as non-200 JSON/HTML -> `NETWORK_ERROR` with server message; polite pacing random waits are kept in the command.

## Capture Assessment

This command should be captured. It is a verified, parameterizable path (repo + limit), the highest-value community data layer for HF repos, returns structured discussion metadata, and chains directly into `huggingface/get-discussion` (output `url`/`number`). The path was exercised end-to-end in the explore stage against a model, a dataset, and a Space, plus a 404 error case.
