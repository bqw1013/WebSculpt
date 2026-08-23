// huggingface/list-papers: HF 趋势论文列表（daily/weekly/monthly）
// Data source: SSR hydration JSON in <div data-target="DailyPapers" data-props="...">.
// Period selection: /papers redirect is state-dependent, so we always click the target period tab.

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const humanPause = (page) => page.waitForTimeout(randomInt(300, 900));

const humanScroll = (page) =>
  page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), randomInt(60, 180));

const humanMove = async (page) => {
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const x = Math.max(0, Math.min(size.w, Math.floor(size.w / 2 + (Math.random() - 0.5) * 160)));
  const y = Math.max(0, Math.min(size.h, Math.floor(size.h / 2 + (Math.random() - 0.5) * 160)));
  await page.mouse.move(x, y);
};

const readDailyPapers = async (page) => {
  const data = await page.evaluate(() => {
    const el = document.querySelector('[data-target="DailyPapers"]');
    if (!el) return null;
    try {
      return JSON.parse(el.getAttribute("data-props"));
    } catch (e) {
      return null;
    }
  });
  if (!data || !Array.isArray(data.dailyPapers) || data.dailyPapers.length === 0) {
    const err = new Error("[EMPTY_RESULT] No papers found on the page");
    err.code = "EMPTY_RESULT";
    throw err;
  }
  return data;
};

export default async (page, params, cwd) => {
  const period = params.period;
  const limit = parseInt(params.limit, 10);

  const PERIOD_META = {
    daily: { label: "Daily", urlPart: "/papers/date/", type: "day" },
    weekly: { label: "Weekly", urlPart: "/papers/week/", type: "week" },
    monthly: { label: "Monthly", urlPart: "/papers/month/", type: "month" }
  };

  if (!PERIOD_META[period]) {
    const err = new Error("[INVALID_PARAM] period must be one of: daily (每日), weekly (每周), monthly (每月)");
    err.code = "INVALID_PARAM";
    throw err;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  // Navigate to the papers hub. The landing period is state-dependent (remembers the last
  // viewed period), so we read the actual landing period and click the tab only if needed.
  await page.goto("https://huggingface.co/papers", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-target="DailyPapers"]', { timeout: 20000 });
  await humanScroll(page);
  await humanMove(page);
  await humanPause(page);

  const meta = PERIOD_META[period];
  const landed = await page.evaluate(() => {
    const el = document.querySelector('[data-target="DailyPapers"]');
    try {
      return JSON.parse(el.getAttribute("data-props"));
    } catch (e) {
      return null;
    }
  });

  if (!landed || landed.periodType !== meta.type) {
    const btn = page.locator("button", { hasText: meta.label });
    if ((await btn.count()) === 0) {
      const err = new Error("[DRIFT_DETECTED] Could not find period tab button: " + meta.label);
      err.code = "DRIFT_DETECTED";
      throw err;
    }
    await btn.first().click();
    // Wait until the hydration JSON reflects the target period. Waiting on URL alone races
    // with the SPA re-render (the data-props div can still hold the previous period's data
    // or be temporarily absent mid-navigation). Use a cheap substring check on the decoded
    // attribute (getAttribute unescapes entities) instead of a full JSON.parse per poll —
    // the 105-paper data-props is large and parsing it on every poll is slow.
    await page.waitForFunction(
      (type) => {
        const el = document.querySelector('[data-target="DailyPapers"]');
        if (!el) return false;
        const v = el.getAttribute("data-props");
        return !!v && v.includes('"periodType":"' + type + '"');
      },
      meta.type,
      { timeout: 20000 }
    );
    await humanPause(page);
  }

  const data = await readDailyPapers(page);

  const papers = data.dailyPapers.slice(0, limit).map((item, i) => {
    const p = item.paper || {};
    const authors = (p.authors || [])
      .map((a) => a.name || (a.user && (a.user.fullname || a.user.user)) || null)
      .filter(Boolean);
    const organization = (p.organization && p.organization.fullname) || null;
    return {
      rank: i + 1,
      title: p.title || "",
      url: p.id ? "https://huggingface.co/papers/" + p.id : "",
      abstract: p.summary || "",
      authors,
      published: p.publishedAt || null,
      upvotes: typeof p.upvotes === "number" ? p.upvotes : 0,
      github: p.githubRepo
        ? { url: p.githubRepo, stars: typeof p.githubStars === "number" ? p.githubStars : null }
        : null,
      arxiv: p.id ? "https://arxiv.org/abs/" + p.id : null,
      organization,
      comments: typeof item.numComments === "number" ? item.numComments : 0,
      submittedBy: (item.submittedBy && (item.submittedBy.fullname || item.submittedBy.name)) || null
    };
  });

  return { papers, count: papers.length, period };
};
