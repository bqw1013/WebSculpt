export default async (page, params, cwd) => {
  const section = params.section ?? "recommended";
  const categoryParam = params.category;
  const limitRaw = params.limit ?? "20";

  const validSections = ["recommended", "popular", "curated", "category"];
  if (!validSections.includes(section)) {
    const err = new Error(`[INVALID_PARAM] section must be one of: ${validSections.join(", ")}`);
    err.code = "INVALID_PARAM";
    throw err;
  }

  if (section === "category" && (!categoryParam || categoryParam.trim().length === 0)) {
    const err = new Error("[MISSING_PARAM] category is required when section=category");
    err.code = "MISSING_PARAM";
    throw err;
  }

  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randomDelay = (min, max) => page.waitForTimeout(randInt(min, max));
  const waitForStable = () => page.waitForTimeout(randInt(600, 1400));

  const checkBlocked = async () => {
    const blocked = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.toLowerCase() : "";
      return text.includes("blocked by network security") || text.includes("you've been blocked");
    }).catch(() => false);
    return blocked;
  };

  const navigate = async (url) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (e) {
      const err = new Error("[TIMEOUT] Page navigation timed out");
      err.code = "TIMEOUT";
      throw err;
    }
    if (await checkBlocked()) {
      const err = new Error("[BLOCKED] Reddit has blocked this request; log in to your Reddit account in the browser and try again");
      err.code = "BLOCKED";
      throw err;
    }
  };

  const wiggleMouse = async () => {
    try {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      await page.mouse.move(
        randInt(20, Math.max(40, viewport.width - 20)),
        randInt(20, Math.max(40, viewport.height - 20))
      );
    } catch (_) {
      // optional
    }
  };

  let sourceUrl = "https://www.reddit.com/explore/";

  if (section === "category") {
    await navigate("https://www.reddit.com/explore/");
    await waitForStable();

    const categories = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a"))
        .map((a) => ({
          text: (a.innerText || "").trim(),
          href: a.getAttribute("href") || "",
        }))
        .filter((x) => x.text && x.href && x.href.startsWith("/explore/"))
    );

    const target = categories.find(
      (c) => c.text.toLowerCase() === categoryParam.toLowerCase()
    ) || categories.find(
      (c) => c.text.toLowerCase().includes(categoryParam.toLowerCase())
    ) || categories.find(
      (c) => categoryParam.toLowerCase().includes(c.text.toLowerCase())
    );

    if (!target) {
      const availableList = categories.map((c) => c.text).filter(Boolean);
      const formatted = availableList.map((t, i) => `${i + 1}. ${t}`).join("\n");
      const err = new Error(
        `[CATEGORY_NOT_FOUND] No category matching "${categoryParam}" was found.\n\nAvailable categories:\n${formatted}`
      );
      err.code = "CATEGORY_NOT_FOUND";
      throw err;
    }

    sourceUrl = `https://www.reddit.com${target.href}`;
    await navigate(sourceUrl);
  } else {
    await navigate(sourceUrl);
  }

  try {
    await page.waitForSelector("community-recommendation", { timeout: 15000 });
  } catch (e) {
    if (await checkBlocked()) {
      const err = new Error("[BLOCKED] Reddit has blocked this request; log in to your Reddit account in the browser and try again");
      err.code = "BLOCKED";
      throw err;
    }
    const err = new Error("[DRIFT_DETECTED] Expected community cards did not load");
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  await randomDelay(400, 1200);
  await wiggleMouse();

  const headingMap = {
    recommended: "Recommended for you",
    popular: "Most popular",
    curated: "Curated picks",
  };

  const extractCard = (el) => {
    const anchor = el.querySelector('a[href^="/r/"]');
    const href = anchor ? anchor.getAttribute("href") : "";
    const name = href.replace("/r/", "").replace(/\/$/, "");
    const displayNameEl = el.querySelector("h4");
    const displayName = displayNameEl ? displayNameEl.innerText.trim() : name;
    const numberEl = el.querySelector("faceplate-number");
    const weeklyVisitors = numberEl ? numberEl.innerText.trim() : "";
    const descEl = el.querySelector('p[class*="line-clamp-2"]') || el.querySelector("p");
    const description = descEl ? descEl.innerText.trim() : "";
    const iconEl = el.querySelector("img.shreddit-subreddit-icon__icon");
    const iconUrl = iconEl ? iconEl.getAttribute("src") : "";
    return {
      name,
      display_name: displayName,
      weekly_visitors: weeklyVisitors,
      description,
      permalink: href ? `https://www.reddit.com${href}` : "",
      icon_url: iconUrl,
    };
  };

  const clickShowMoreButtons = () =>
    page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button")).filter(
        (b) => (b.getAttribute("aria-label") || "").toLowerCase().includes("show more")
      );
      let clicked = 0;
      for (const btn of buttons) {
        btn.click();
        clicked++;
      }
      return clicked;
    });

  const allCards = new Map();
  const maxLoadRounds = 5;

  for (let round = 0; round < maxLoadRounds; round++) {
    const previousSize = allCards.size;

    let batch = [];
    if (section === "category") {
      batch = await page.evaluate(() =>
        Array.from(document.querySelectorAll("community-recommendation"))
          .map((el) => {
            const anchor = el.querySelector('a[href^="/r/"]');
            const href = anchor ? anchor.getAttribute("href") : "";
            const name = href.replace("/r/", "").replace(/\/$/, "");
            const displayNameEl = el.querySelector("h4");
            const displayName = displayNameEl ? displayNameEl.innerText.trim() : name;
            const numberEl = el.querySelector("faceplate-number");
            const weeklyVisitors = numberEl ? numberEl.innerText.trim() : "";
            const descEl = el.querySelector('p[class*="line-clamp-2"]') || el.querySelector("p");
            const description = descEl ? descEl.innerText.trim() : "";
            const iconEl = el.querySelector("img.shreddit-subreddit-icon__icon");
            const iconUrl = iconEl ? iconEl.getAttribute("src") : "";
            return {
              name,
              display_name: displayName,
              weekly_visitors: weeklyVisitors,
              description,
              permalink: href ? `https://www.reddit.com${href}` : "",
              icon_url: iconUrl,
            };
          })
          .filter((c) => c.name)
      );
    } else {
      const headingText = headingMap[section];
      batch = await page.evaluate((heading) => {
        const h = Array.from(document.querySelectorAll("h3")).find(
          (el) => el.innerText.trim() === heading
        );
        if (!h) return [];
        const container = h.closest("in-feed-community-recommendations");
        if (!container) return [];
        return Array.from(container.querySelectorAll("community-recommendation"))
          .map((el) => {
            const anchor = el.querySelector('a[href^="/r/"]');
            const href = anchor ? anchor.getAttribute("href") : "";
            const name = href.replace("/r/", "").replace(/\/$/, "");
            const displayNameEl = el.querySelector("h4");
            const displayName = displayNameEl ? displayNameEl.innerText.trim() : name;
            const numberEl = el.querySelector("faceplate-number");
            const weeklyVisitors = numberEl ? numberEl.innerText.trim() : "";
            const descEl = el.querySelector('p[class*="line-clamp-2"]') || el.querySelector("p");
            const description = descEl ? descEl.innerText.trim() : "";
            const iconEl = el.querySelector("img.shreddit-subreddit-icon__icon");
            const iconUrl = iconEl ? iconEl.getAttribute("src") : "";
            return {
              name,
              display_name: displayName,
              weekly_visitors: weeklyVisitors,
              description,
              permalink: href ? `https://www.reddit.com${href}` : "",
              icon_url: iconUrl,
            };
          })
          .filter((c) => c.name);
      }, headingText);
    }

    for (const card of batch) {
      if (!allCards.has(card.name)) {
        allCards.set(card.name, card);
      }
    }

    if (allCards.size >= limit) break;
    if (allCards.size === previousSize) {
      // try expanding once, then stop if still no growth
      const clicked = await clickShowMoreButtons();
      if (clicked === 0) break;
      await randomDelay(1200, 2200);
      if (Math.random() < 0.3) await wiggleMouse();
      // one more extraction attempt next round
    } else {
      // scroll a bit to trigger any lazy loading
      await page.evaluate(() => {
        window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
      });
      await randomDelay(800, 1500);
      if (Math.random() < 0.3) await wiggleMouse();
    }
  }

  const subreddits = Array.from(allCards.values())
    .slice(0, limit)
    .map((c, idx) => ({ rank: idx + 1, ...c }));

  await randomDelay(0, 2000);

  if (subreddits.length === 0) {
    const err = new Error("[EMPTY_RESULT] No subreddits were found for the requested section");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  return {
    section,
    category: section === "category" ? categoryParam : null,
    limit,
    total: subreddits.length,
    source: page.url(),
    subreddits,
  };
};
