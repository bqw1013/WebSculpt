# producthunt/get-launch-comments

Fetch the rendered discussion for one Product Hunt launch by product slug and launch slug. It uses the launch page's default `Best` ordering and the verified numeric comment pagination path.

## Description

Compact mode returns the launch identity/summary and the rendered comment cards. Detailed mode adds launch metadata, raw comment text, and thread identifiers. The command is for a specific launch discussion; product Reviews and Product Forum threads are separate surfaces.

## Parameters

- `product` — required Product Hunt product slug, such as `linear`.
- `launch` — required launch slug under that product, such as `linear-diffs`.
- `page` — positive comment page number; defaults to `1`. Page 2 was verified at `?page=2#comments`.
- `detailed` — `true` or `false`; defaults to `false`.

There is intentionally no `limit` or `sort` parameter: the explored page verified the default `Best` sort but did not verify a stable input for changing sort or page size.

## Return Value

The result contains `sourceUrl`, `productSlug`, `launchSlug`, `page`, `sort` (the observed `Best` ordering), `launch`, `comments`, `count`, and `pagination`. Compact `launch` includes `title`, `tagline`, `points`, and `commentCount`; detailed mode adds description, tags, hunter/makers, featured date, ranks, and launch raw text. Each comment includes `id`, `author`, `affiliation`, `product`, `isHunter`, `text`, `upvotes`, and `age`; detailed mode adds `rawText` and `threadId`.

## Usage

```
websculpt producthunt get-launch-comments --product linear --launch linear-diffs
websculpt producthunt get-launch-comments --product linear --launch linear-diffs --page 2 --detailed true
```

## Common Error Codes

- `MISSING_PARAM` — `product` or `launch` was omitted.
- `INVALID_PARAM` — a slug, page, or detailed value is malformed.
- `NOT_FOUND` — the Product Hunt product/launch does not exist.
- `DRIFT_DETECTED` — the expected launch modal or comments feed was not rendered.
- `EMPTY_RESULT` — the page rendered without comments.
