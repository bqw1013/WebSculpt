# spotify/get-hub

Fetch Spotify's podcast hub page (`/genre/0JQ5DArNBzkmxXHCqFLx2J` — reached via 浏览播客 in the homepage sidebar). Returns every shelf rendered on the page with its title, page URL, and item cards.

## Description

The podcast hub is the entry point of Spotify's podcast browsing surface. This command loads the hub in the attached browser, scrolls to trigger lazy-loaded content, and returns each shelf with its item cards. A card is:

- `podcast` (`/show/{id}`): a podcast show.
- `episode` (`/episode/{id}`): a single episode.
- `category` (`/genre/{id}`): a category entry card (the hub's "Categories" shelf).

**Verified 2026-08-20**: the hub currently renders a single "Categories" shelf (9 category cards) and nothing else — no editorial shelves (Episodes You Won't Want to Miss / New Show Releases) and no 选择语言 language filter in the tested market. The command is adaptive: it returns whatever shelves actually exist, so it keeps working if the page is extended later.

## Parameters

None.

## Return Value

```
{
  shelves: [{
    name: string,        // shelf title, e.g. "Categories"
    url: string|null,    // shelf "show all" page URL, or null when the shelf has none
    items: [{
      kind: "category" | "podcast" | "episode",
      id: string,        // URL segment id (genre/show/episode id)
      url: string,       // https://open.spotify.com/... page URL
      title: string,     // card title, e.g. "Comedy"
      subtitle: string|null,  // card subtitle (publisher for shows, show name for episodes), or null
      cover: string|null      // cover image URL, or null
    }]
  }],
  partial: false         // reserved; false on success
}
```

## Usage

```
websculpt spotify get-hub
```

## Common Error Codes

- `EMPTY_RESULT`: no shelf rendered on the hub page (page structure changed, or content failed to load).
- `DRIFT_DETECTED`: (reserved) if shelf/item selectors stop matching a future redesign.
- `BROWSER_ATTACH_REQUIRED`: the daemon could not attach to Chrome (infrastructure, not a page error).
- `COMMAND_TIMEOUT`: execution exceeded the daemon's 20-minute command timeout.
