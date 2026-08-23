export default async (page, params, cwd) => {
  const query = params.query;
  if (!query || query.trim().length === 0) {
    const err = new Error("[MISSING_PARAM] query is required");
    err.code = "MISSING_PARAM";
    throw err;
  }

  const limitRaw = params.limit;
  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randomDelay = (min, max) => page.waitForTimeout(randInt(min, max));
  const waitForStable = () => page.waitForTimeout(randInt(200, 500));

  const checkBlocked = async () => {
    const blocked = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.toLowerCase() : "";
      return text.includes("blocked by network security") || text.includes("you've been blocked");
    }).catch(() => false);
    return blocked;
  };

  const wiggleMouse = async (probability = 1.0) => {
    if (Math.random() >= probability) return;
    try {
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      const centerX = randInt(40, Math.max(60, viewport.width - 40));
      const centerY = randInt(40, Math.max(60, viewport.height - 40));
      await page.mouse.move(
        randInt(centerX - 30, centerX + 30),
        randInt(centerY - 30, centerY + 30)
      );
    } catch (_) {
      // optional
    }
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

  const sourceUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&type=communities`;
  await navigate(sourceUrl);
  await waitForStable();
  await wiggleMouse(0.5);

  // Ensure the Communities tab is active. Direct navigation sometimes lands on
  // the "All" results tab; fall back to clicking the Communities tab link.
  let hasCommunities = false;
  try {
    await page.waitForSelector('[data-testid="search-community"]', { timeout: 8000 });
    hasCommunities = true;
  } catch (_) {
    hasCommunities = false;
  }

  if (!hasCommunities) {
    const tabClicked = await page.evaluate((q) => {
      const tab = Array.from(document.querySelectorAll('a')).find(
        (a) => {
          const href = a.getAttribute("href") || "";
          return href.includes(`type=communities`) && href.includes(`q=${encodeURIComponent(q)}`);
        }
      );
      if (tab) {
        tab.click();
        return true;
      }
      return false;
    }, query);

    if (!tabClicked) {
      if (await checkBlocked()) {
        const err = new Error("[BLOCKED] Reddit has blocked this request; log in to your Reddit account in the browser and try again");
        err.code = "BLOCKED";
        throw err;
      }
      const err = new Error("[DRIFT_DETECTED] Communities tab could not be found");
      err.code = "DRIFT_DETECTED";
      throw err;
    }

    try {
      await page.waitForSelector('[data-testid="search-community"]', { timeout: 15000 });
    } catch (e) {
      if (await checkBlocked()) {
        const err = new Error("[BLOCKED] Reddit has blocked this request; log in to your Reddit account in the browser and try again");
        err.code = "BLOCKED";
        throw err;
      }
      const err = new Error("[DRIFT_DETECTED] Community cards did not load after selecting Communities tab");
      err.code = "DRIFT_DETECTED";
      throw err;
    }
  }

  await randomDelay(200, 500);
  await wiggleMouse(0.5);

  const extractCards = () => {
    const cards = Array.from(document.querySelectorAll('[data-testid="search-community"]'));
    return cards.map((el) => {
      const anchor = el.querySelector('a[href^="/r/"]');
      const href = anchor ? anchor.getAttribute("href") : "";
      const name = href.replace("/r/", "").replace(/\/$/, "");
      const h2 = el.querySelector("h2");
      const qualifiedName = h2 ? h2.innerText.trim() : `r/${name}`;

      const lines = el.innerText.split("\n").map((l) => l.trim()).filter(Boolean);

      // Telemetry context contains id, display name, nsfw and quarantined flags.
      let subredditId = "";
      let displayName = lines[0] || name;
      let nsfw = false;
      let quarantined = false;
      const tracker = el.querySelector("search-telemetry-tracker");
      if (tracker) {
        try {
          const ctx = JSON.parse(tracker.getAttribute("data-faceplate-tracking-context") || "{}");
          const sub = ctx && ctx.subreddit ? ctx.subreddit : {};
          if (sub.id) subredditId = sub.id;
          if (sub.name) displayName = sub.name;
          if (typeof sub.nsfw === "boolean") nsfw = sub.nsfw;
          if (typeof sub.quarantined === "boolean") quarantined = sub.quarantined;
        } catch (_) {
          // ignore parse errors
        }
      }

      const descEl = el.querySelector('[data-testid="search-subreddit-desc-text"]');
      const description = descEl ? descEl.innerText.trim() : "";

      // Weekly stats: prefer raw numbers from faceplate-number elements.
      const numberEls = Array.from(el.querySelectorAll("faceplate-number"));
      const visitorsEl = numberEls[0];
      const contributionsEl = numberEls[1];
      const weeklyVisitors = visitorsEl ? visitorsEl.textContent.trim() : "";
      const weeklyContributions = contributionsEl ? contributionsEl.textContent.trim() : "";
      const weeklyVisitorsRawNum = visitorsEl ? parseInt(visitorsEl.getAttribute("number") || "", 10) : NaN;
      const weeklyContributionsRawNum = contributionsEl ? parseInt(contributionsEl.getAttribute("number") || "", 10) : NaN;
      const weeklyVisitorsRaw = Number.isNaN(weeklyVisitorsRawNum) ? null : weeklyVisitorsRawNum;
      const weeklyContributionsRaw = Number.isNaN(weeklyContributionsRawNum) ? null : weeklyContributionsRawNum;

      const iconEl = el.querySelector("img.shreddit-subreddit-icon__icon");
      const iconUrl = iconEl ? iconEl.getAttribute("src") : "";

      return {
        subreddit_id: subredditId,
        name,
        display_name: displayName,
        subreddit: qualifiedName,
        description,
        nsfw,
        quarantined,
        weekly_visitors: weeklyVisitors,
        weekly_visitors_raw: weeklyVisitorsRaw,
        weekly_contributions: weeklyContributions,
        weekly_contributions_raw: weeklyContributionsRaw,
        permalink: href ? `https://www.reddit.com${href}` : "",
        icon_url: iconUrl,
      };
    }).filter((c) => c.name);
  };

  const allCards = new Map();
  const maxLoadRounds = 10;
  let scrollIterations = 0;
  let noGrowthStreak = 0;

  for (let round = 0; round < maxLoadRounds; round++) {
    scrollIterations = round;
    const previousSize = allCards.size;

    const batch = await page.evaluate(extractCards);
    for (const card of batch) {
      if (!allCards.has(card.name)) {
        allCards.set(card.name, card);
      }
    }

    if (allCards.size >= limit) break;
    if (allCards.size === previousSize) {
      noGrowthStreak += 1;
      if (noGrowthStreak >= 2) break;
    } else {
      noGrowthStreak = 0;
    }

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await randomDelay(300, 800);
    if (Math.random() < 0.15) await wiggleMouse();
  }

  const subreddits = Array.from(allCards.values()).slice(0, limit);
  const truncated = allCards.size > limit;

  await randomDelay(0, 500);

  if (subreddits.length === 0) {
    const err = new Error("[EMPTY_RESULT] No subreddits were found for the given query");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  return {
    query,
    limit,
    total: subreddits.length,
    source: page.url(),
    subreddits,
    truncated,
    scrollIterations,
  };
};
