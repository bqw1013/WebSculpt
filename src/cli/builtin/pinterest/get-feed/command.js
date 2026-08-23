const MAX_LIMIT = 100;
const FEED_URL = "https://www.pinterest.com/";

function errorWithCode(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 20;
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw errorWithCode("INVALID_PARAM", "limit must be a positive integer");
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit)) {
    throw errorWithCode("INVALID_PARAM", "limit must be a safe integer");
  }
  if (limit > MAX_LIMIT) {
    throw errorWithCode("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
  }
  return limit;
}

function normalizePin(raw) {
  if (!raw || !raw.id) return null;
  const videoList =
    raw.videos && raw.videos.video_list ? raw.videos.video_list : {};
  const hlsKeys = Object.keys(videoList);
  hlsKeys.sort(
    (a, b) => (videoList[b].duration || 0) - (videoList[a].duration || 0)
  );
  const hlsUrl = hlsKeys.length ? videoList[hlsKeys[0]].url || null : null;
  const item = {
    id: String(raw.id),
    title: raw.grid_title || raw.title || null,
    description: raw.description || null,
    imageUrl:
      raw.images && raw.images.orig && raw.images.orig.url
        ? raw.images.orig.url
        : null,
    sourceLink: raw.link || null,
    creator:
      raw.pinner && (raw.pinner.username || raw.pinner.full_name)
        ? {
            username: raw.pinner.username || null,
            displayName: raw.pinner.full_name || null,
          }
        : null,
    pinUrl: `https://www.pinterest.com/pin/${raw.id}/`,
  };
  if (hlsUrl) item.videoHlsUrl = hlsUrl;
  return item;
}

export default async (page, params, cwd) => {
  const limit = parseLimit(params.limit);

  // Collector for UserHomefeedResource responses (bookmark-cursor pagination).
  const feedBatches = [];
  let feedExhausted = false;

  const onResponse = (resp) => {
    try {
      const url = resp.url();
      if (!url.includes("/resource/UserHomefeedResource/get/")) return;
      if (resp.status() !== 200) return;
      resp
        .text()
        .then((body) => {
          try {
            const json = JSON.parse(body);
            const rr = json && json.resource_response;
            if (!rr || !rr.data || typeof rr.data !== "object") return;
            const pins = Object.values(rr.data).filter((p) => p && p.id);
            if (!pins.length) return;
            feedBatches.push({
              pins,
              ok: rr.status === "success" || rr.code === 0,
              bookmark: rr.bookmark || null,
            });
          } catch (e) {
            // ignore malformed bodies
          }
        })
        .catch(() => {});
    } catch (e) {
      // ignore
    }
  };
  page.on("response", onResponse);

  const collected = new Map();
  let batchIndex = 0;

  const drain = () => {
    let added = 0;
    while (batchIndex < feedBatches.length) {
      const batch = feedBatches[batchIndex];
      batchIndex += 1;
      if (!batch.bookmark) feedExhausted = true;
      if (batch.ok === false) feedExhausted = true;
      for (const raw of batch.pins) {
        const item = normalizePin(raw);
        if (item && !collected.has(item.id)) {
          collected.set(item.id, item);
          added += 1;
        }
      }
    }
    return added;
  };

  const waitForBatches = async (targetCount, timeoutMs) => {
    const start = Date.now();
    while (feedBatches.length < targetCount && Date.now() - start < timeoutMs) {
      await page.waitForTimeout(80 + Math.random() * 120);
    }
  };

  try {
    await page.goto(FEED_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page
      .waitForSelector(
        "#__PWS_INITIAL_PROPS__, [data-test-id=masonry-container]",
        { timeout: 20000 }
      )
      .catch(() => null);

    const boot = await page.evaluate(() => {
      const s = document.getElementById("__PWS_INITIAL_PROPS__");
      const out = {
        isAuthenticated: null,
        pins: [],
        hasMasonry: !!document.querySelector("[data-test-id=masonry-container]"),
        hasLogin: !!document.querySelector(
          "[data-test-id=login-button], [data-test-id=gift-registry-button], [data-test-id=guest-modal]"
        ),
      };
      if (s) {
        try {
          const st = JSON.parse(s.textContent).initialReduxState || {};
          out.isAuthenticated = st.session ? st.session.isAuthenticated : null;
          out.pins = st.pins ? Object.values(st.pins) : [];
        } catch (e) {
          // ignore
        }
      }
      return out;
    });

    if (
      boot.isAuthenticated === false ||
      (boot.isAuthenticated === null && !boot.hasMasonry && boot.hasLogin)
    ) {
      throw errorWithCode(
        "AUTH_REQUIRED",
        "Pinterest home feed requires a logged-in session"
      );
    }
    if (
      boot.isAuthenticated === null &&
      !boot.hasMasonry &&
      !boot.hasLogin &&
      boot.pins.length === 0
    ) {
      throw errorWithCode(
        "DRIFT_DETECTED",
        "Pinterest home feed structure was not found"
      );
    }

    for (const raw of boot.pins) {
      const item = normalizePin(raw);
      if (item) collected.set(item.id, item);
    }

    // The initial page load fires a UserHomefeedResource request automatically;
    // wait for it (minimal necessary wait) and drain it.
    if (collected.size < limit) {
      await waitForBatches(1, 3000);
      drain();
    }

    let scrollCount = 0;
    let idleStreak = 0;
    let slowStreak = 0;

    while (collected.size < limit && !feedExhausted && scrollCount < 60) {
      scrollCount += 1;

      // Randomized scroll step (vary scroll patterns).
      await page.evaluate(() => {
        window.scrollBy(0, 800 + Math.random() * 500);
      });

      // Randomized short inter-scroll wait (200-500ms); lengthened adaptively
      // when throttling / no-progress is suspected.
      await page.waitForTimeout(200 + Math.random() * 300 + slowStreak * 250);

      // Occasional gentle mouse move away from pins (low-frequency realism).
      if (scrollCount % 2 === 0) {
        await page.mouse
          .move(100 + Math.random() * 800, 40 + Math.random() * 60)
          .catch(() => {});
      }

      const before = feedBatches.length;
      await waitForBatches(before + 1, 2200);
      const added = drain();

      if (added === 0) {
        idleStreak += 1;
        slowStreak += 1;
        if (idleStreak >= 4) {
          feedExhausted = true;
        }
      } else {
        idleStreak = 0;
        slowStreak = Math.max(0, slowStreak - 1);
      }
    }

    const items = Array.from(collected.values()).slice(0, limit);
    return {
      items,
      count: items.length,
      limit,
      partial: items.length < limit,
    };
  } finally {
    page.removeListener("response", onResponse);
  }
};
