// pinterest/get-board
// Fetch a Pinterest Board's metadata and the Pins inside it.
// Board = user-curated collection (bookmark folder / album) that groups saved Pins by theme.
// Stream loads via BoardFeedResource (bookmark pagination); DOM is virtualized so Pin data
// is accumulated from the API responses, not from counting DOM nodes.

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function errorWithCode(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_LIMIT;
  const raw = String(value).trim();
  if (!/^[1-9]\d*$/.test(raw)) {
    throw errorWithCode("INVALID_PARAM", "limit must be a positive integer");
  }
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit)) {
    throw errorWithCode("INVALID_PARAM", "limit must be a safe integer");
  }
  if (limit < 1 || limit > MAX_LIMIT) {
    throw errorWithCode("INVALID_PARAM", `limit must be between 1 and ${MAX_LIMIT}`);
  }
  return limit;
}

function normalizeBoardUrl(value) {
  let url = String(value || "").trim();
  if (!url) {
    throw errorWithCode("MISSING_PARAM", "url is required");
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function mapPin(pin) {
  const videoList =
    pin && pin.videos && pin.videos.video_list
      ? Object.values(pin.videos.video_list)
      : [];
  const hls =
    videoList.find((v) => typeof v.url === "string" && v.url.includes("/hls/")) ||
    videoList[0];
  const isVideo = videoList.length > 0;
  const att = (pin && (pin.grid_attribution || pin.pinner)) || null;
  const id = pin && pin.id != null ? String(pin.id) : "";
  const rawTitle = pin && (pin.grid_title || pin.title);
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  return {
    id,
    title,
    description: pin && pin.description != null ? String(pin.description) : "",
    mediaType: isVideo ? "video" : "image",
    imageUrl:
      (pin &&
        pin.images &&
        pin.images.orig &&
        pin.images.orig.url) ||
      (isVideo && hls && hls.thumbnail) ||
      null,
    videoHlsUrl: isVideo && hls ? hls.url : null,
    sourceLink: pin && pin.link ? String(pin.link) : null,
    creator:
      att && (att.username || att.full_name)
        ? {
            username: att.username ? String(att.username) : null,
            displayName: att.full_name ? String(att.full_name) : null,
          }
        : null,
    pinUrl: id ? `https://www.pinterest.com/pin/${id}/` : null,
  };
}

export default async (page, params, cwd) => {
  const url = normalizeBoardUrl(params.url);
  const limit = parseLimit(params.limit);

  let allPins = [];
  let bookmark = null;
  let feedResponded = false;

  page.on("response", async (resp) => {
    try {
      if (
        resp.url().includes("/resource/BoardFeedResource/get/") &&
        resp.request().method() === "GET"
      ) {
        const body = await resp.json();
        const rr = body && body.resource_response;
        if (rr && Array.isArray(rr.data)) {
          // data array can mix real Pins (type "pin") with "story" recommendation
          // modules; keep only Pins.
          const realPins = rr.data.filter((p) => p && p.type === "pin");
          allPins = allPins.concat(realPins);
          bookmark = rr.bookmark || null;
          feedResponded = true;
        }
      }
    } catch (e) {
      // ignore interception errors; feedResponded stays as-is
    }
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // NOT_FOUND: Pinterest client-side redirects missing boards to /?show_error=true
  await page.waitForTimeout(1500);
  const currentUrl = page.url();
  if (currentUrl.includes("show_error=true")) {
    throw errorWithCode("NOT_FOUND", `Board not found: ${url}`);
  }

  const headerVisible = await page
    .waitForSelector('[data-test-id="board-header"]', { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!headerVisible) {
    // The NOT_FOUND redirect can be slower than the settle wait above; re-check the URL
    // before falling back to a structural-drift error.
    if (page.url().includes("show_error=true")) {
      throw errorWithCode("NOT_FOUND", `Board not found: ${url}`);
    }
    throw errorWithCode("DRIFT_DETECTED", "Board header selector was not found");
  }

  const meta = await page.evaluate(() => {
    const text = (sel) => {
      const node = document.querySelector(sel);
      return node ? node.innerText.trim() : null;
    };
    const ownerLink = document.querySelector(
      '[data-test-id="board-header-details"] a[href^="/"]'
    );
    const pinCountText = text('[data-test-id="pin-count"]');
    const pinCount = pinCountText
      ? parseInt(pinCountText.replace(/[^0-9]/g, ""), 10) || null
      : null;
    // Description: prefer the full text on the inner [title] attribute; otherwise strip
    // the UI expand/collapse marker ("……展开"/"展开"/"收起") from the container text.
    const descContainer = document.querySelector(
      '[data-test-id="board-description-container"]'
    );
    let description = null;
    if (descContainer) {
      const titled = descContainer.querySelector("[title]");
      const titledText = titled && titled.getAttribute("title")
        ? titled.getAttribute("title").trim()
        : "";
      description = titledText || descContainer.innerText.trim()
        .replace(/\s*……展开\s*$/u, "")
        .replace(/\s*展开\s*$/u, "")
        .replace(/\s*收起\s*$/u, "")
        .trim();
    }
    return {
      name: text("h1#board-name"),
      pinCount,
      description,
      ownerUsername: ownerLink
        ? ownerLink.getAttribute("href").replace(/^\/|\/$/g, "")
        : null,
      ownerDisplayName: ownerLink ? ownerLink.innerText.trim() : null,
    };
  });

  // Wait for the initial BoardFeedResource response (first ~25 Pins load automatically).
  for (let i = 0; i < 75 && !feedResponded; i += 1) {
    await page.waitForTimeout(200);
  }

  if (!feedResponded) {
    if (meta.pinCount === 0 || meta.pinCount === null) {
      return {
        name: meta.name,
        description: meta.description,
        pinCount: meta.pinCount || 0,
        owner: {
          username: meta.ownerUsername,
          displayName: meta.ownerDisplayName,
        },
        boardUrl: url,
        pins: [],
        partial: true,
      };
    }
    throw errorWithCode(
      "DRIFT_DETECTED",
      "BoardFeedResource did not return Pin data"
    );
  }

  // Scroll to load more Pins until limit reached or the board is exhausted.
  // Random 0.8-1.4 viewport steps with random 200-500ms waits (vary scroll patterns).
  // Overshooting the load-more sentinel at the bottom stalls the feed, so when the
  // page is at max scroll we pull up slightly to bring the sentinel back into view.
  let guard = 0;
  let stall = 0;
  let lastCount = allPins.length;
  while (allPins.length < limit && bookmark !== null && guard < 250) {
    await page.evaluate(() => {
      const maxY = document.body.scrollHeight - window.innerHeight;
      const curY = window.scrollY;
      if (curY >= maxY - 20) {
        window.scrollTo(0, Math.max(0, maxY - Math.floor(window.innerHeight * 1.1)));
      } else {
        window.scrollBy(0, Math.floor(window.innerHeight * (0.8 + Math.random() * 0.6)));
      }
    });
    await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
    guard += 1;
    if (allPins.length === lastCount) {
      stall += 1;
      if (stall >= 15) break; // throttled or stalled; return what we have
    } else {
      stall = 0;
      lastCount = allPins.length;
    }
  }

  const pins = allPins.slice(0, limit).map(mapPin);

  return {
    name: meta.name,
    description: meta.description,
    pinCount: meta.pinCount,
    owner: {
      username: meta.ownerUsername,
      displayName: meta.ownerDisplayName,
    },
    boardUrl: url,
    pins,
    partial: pins.length < limit,
  };
};
