// Pinterest Trends (trends.pinterest.com) ranking extractor.
// Three types: featured (DOM, top-5 module), shopping (DOM, paginated table),
// search (in-page fetch to the top_trends_filtered API).
// Filtering is done entirely via URL parameters (country / topicInterestIds / trendsPreset).

const REGION_MAP = {
  us: "US",
  uk: "GB+IE",
  ca: "CA",
  de: "DE",
  fr: "FR",
  it: "IT",
  es: "ES",
  br: "BR",
  mx: "MX",
  ar: "AR",
  co: "CO",
  au: "AU+NZ",
  my: "MY",
  ph: "PH",
  th: "TH",
  eg: "EG",
  tr: "TR",
  kr: "KR",
  "south-europe": "IT+ES+PT+GR+MT",
  germanic: "DE+AT+CH",
  nordic: "SE+DK+FI+NO",
  benelux: "NL+BE+LU",
  "eastern-europe": "PL+RO+HU+SK+CZ",
  "hispanic-latam": "MX+AR+CO+CL",
  "latam-caribbean": "CR+DO+EC+GT+PE",
  "east-europe-med": "CY+CZ+GR+HU+MT+PL+RO+SK"
};

const INTEREST_MAP = {
  all: "ALL",
  animals: "925056443165",
  weddings: "903260720461",
  "home-decor": "935249274030",
  architecture: "918105274631",
  health: "898620064290",
  education: "922134410098",
  travel: "908182459161",
  beauty: "935541271955",
  fashion: "FASHION",
  "food-drink": "918530398158",
  "event-planning": "941870572865",
  art: "961238559656",
  parenting: "920236059316",
  gardening: "909983286710",
  "diy-crafts": "934876475639"
};

const SORT_MAP = {
  growth: { preset: 3, lookback: 3 },
  seasonal: { preset: 4, lookback: 2 },
  monthly: { preset: 1, lookback: 2 },
  yearly: { preset: 2, lookback: 5 }
};

const TYPES = ["featured", "shopping", "search"];

// Random short wait (base + 0..300ms jitter) to keep fingerprint diversity while
// staying well under the command's execution-time target. Pass a larger base when
// a throttle/rate signal was seen so the wait adapts.
function randWait(page, baseMs) {
  const jitter = Math.floor(Math.random() * 300);
  return page.waitForTimeout(baseMs + jitter);
}

function fail(code, message) {
  const err = new Error("[" + code + "] " + message);
  err.code = code;
  return err;
}

// Wait for a selector; returns true when found, false on timeout. Absence is not
// treated as fatal (no-data regions hide entire modules). Uses "attached" so
// off-screen items still match. Callers wait for the module shell first (fast
// no-data detection), then for the data rows that appear after hydration.
async function waitQuietly(page, selector, timeoutMs) {
  try {
    await page.waitForSelector(selector, { timeout: timeoutMs, state: "attached" });
    return true;
  } catch (e) {
    return false;
  }
}

// The logged-in header on the trends subdomain always renders the profile chip.
// Wait briefly for it because the header hydrates after domcontentloaded.
async function isAuthed(page) {
  const found = await waitQuietly(page, '[data-test-id="header-profile"]', 3000);
  return found;
}

async function extractFeatured(page, regionCode, interestValue, limit) {
  const url = new URL("https://trends.pinterest.com/");
  url.searchParams.set("country", regionCode);
  if (interestValue && interestValue !== "ALL") {
    url.searchParams.set("topicInterestIds", interestValue);
  }
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await randWait(page, 300);

  // No-data regions hide the whole featured module; bail fast instead of waiting
  // for cards that will never appear. Waiting on the module first also gives the
  // header time to hydrate, so the auth check below is cheap.
  const hasModule = await waitQuietly(page, '[data-test-id="trends-module-card-top-topics"]', 3000);
  if (hasModule) {
    await waitQuietly(page, '[data-test-id="trends-module-card-top-topics"] [data-test-id="topic-card"]', 8000);
  }

  if (!(await isAuthed(page))) {
    throw fail("AUTH_REQUIRED", "Pinterest Trends subdomain requires a logged-in browser session");
  }

  const items = await page.evaluate(() => {
    const container = document.querySelector('[data-test-id="trends-module-card-top-topics"]');
    if (!container) return [];
    const cards = Array.from(container.querySelectorAll('[data-test-id="topic-card"]'));
    return cards.map((c) => {
      const text = c.innerText || "";
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const rankH5 = c.querySelector("h5");
      const growth = text.match(/较上月增长\s*([0-9,]+)%/);
      return {
        rank: rankH5 ? parseInt(rankH5.innerText.trim(), 10) : parseInt(lines[0] || "0", 10),
        term: lines[1] || "",
        growthPct: growth ? parseInt(growth[1].replace(/,/g, ""), 10) : null,
        categories: Array.from(c.querySelectorAll('[data-test-id^="interest-name-"]')).map((s) => s.innerText.trim())
      };
    });
  });
  const out = items.slice(0, limit);
  return { type: "featured", items: out, count: out.length };
}

async function extractShopping(page, regionCode, limit) {
  const items = [];
  let pageNum = 1;
  // The site serves 10 rows/page, 2 pages max (ranks 1-20).
  while (items.length < limit && pageNum <= 2) {
    const url = new URL("https://trends.pinterest.com/shopping");
    url.searchParams.set("country", regionCode);
    if (pageNum > 1) url.searchParams.set("page", String(pageNum));
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
    await randWait(page, 300);

    // No-data regions hide the table shell; bail fast. Otherwise wait for a data row.
    const hasTable = await waitQuietly(page, '[data-test-id="shopping-trends-product-categories-table"]', 3000);
    if (hasTable) {
      await waitQuietly(page, '[data-test-id="shopping-trends-product-categories-table"] tr h3', 8000);
    }

    if (!(await isAuthed(page))) {
      throw fail("AUTH_REQUIRED", "Pinterest Trends subdomain requires a logged-in browser session");
    }

    const rows = await page.evaluate(() => {
      const table = document.querySelector('[data-test-id="shopping-trends-product-categories-table"]');
      if (!table) return [];
      const rows = Array.from(table.querySelectorAll("tr")).filter((r) => r.querySelector("h3"));
      return rows.map((r) => {
        const tds = Array.from(r.querySelectorAll(":scope > td"));
        const growthEl = r.querySelector('[data-test-id="OUTBOUND_CLICK-growth-summary"]');
        const growthText = growthEl ? growthEl.innerText : "";
        const growth = growthText.match(/较上月增长\s*([0-9,]+)%/);
        return {
          rank: parseInt((tds[0] ? tds[0].innerText : "0").trim(), 10) || 0,
          term: tds[1] ? tds[1].innerText.trim() : "",
          growthPct: growth ? parseInt(growth[1].replace(/,/g, ""), 10) : null
        };
      });
    });
    items.push(...rows);

    const nextDisabled = await page.evaluate(() => {
      const btn = document.querySelector('[data-test-id="next-table-page-button"]');
      return btn ? btn.getAttribute("aria-disabled") === "true" : true;
    });
    if (items.length >= limit || nextDisabled) break;
    pageNum += 1;
    await randWait(page, 300);
  }
  const out = items.slice(0, limit);
  return { type: "shopping", items: out, count: out.length };
}

async function extractSearch(page, regionCode, sortValue, limit) {
  const preset = SORT_MAP[sortValue];
  const url = new URL("https://trends.pinterest.com/search");
  url.searchParams.set("country", regionCode);
  url.searchParams.set("trendsPreset", String(preset.preset));
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await randWait(page, 300);

  if (!(await isAuthed(page))) {
    throw fail("AUTH_REQUIRED", "Pinterest Trends subdomain requires a logged-in browser session");
  }

  let data = null;
  // Retry once with a longer randomized wait if the API reports throttling/errors.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    data = await page.evaluate(async (arg) => {
      const endDateRes = await fetch("/latest_available_date/", { credentials: "include" });
      if (!endDateRes.ok) return { error: "latest_available_date HTTP " + endDateRes.status };
      const endDateJson = await endDateRes.json();
      const apiUrl = "/top_trends_filtered/?lookbackWindow=" + arg.preset.lookback +
        "&endDate=" + endDateJson.date + "&country=" + encodeURIComponent(arg.regionCode) +
        "&trendsPreset=" + arg.preset.preset + "&numTermsToReturn=" + arg.limit;
      const res = await fetch(apiUrl, { credentials: "include" });
      if (!res.ok) return { error: "top_trends_filtered HTTP " + res.status };
      const json = await res.json();
      return {
        items: (json.values || []).map((v, i) => ({
          rank: i + 1,
          term: v.term,
          weeklyChangePct: v.wow_change ? Math.round(v.wow_change.value * 100) : null,
          monthlyChangePct: v.mom_change ? Math.round(v.mom_change.value * 100) : null,
          yearlyChangePct: v.yoy_change ? Math.round(v.yoy_change.value * 100) : null,
          volume: v.searchCount != null ? v.searchCount : (v.normalizedCount != null ? v.normalizedCount : null)
        }))
      };
    }, { regionCode, preset, limit });
    if (!data.error) break;
    await randWait(page, 800);
  }

  if (!data || data.error) {
    throw fail("EMPTY_RESULT", "search trends API unavailable: " + (data ? data.error : "no response"));
  }
  const out = data.items.slice(0, limit);
  return { type: "search", items: out, count: out.length };
}

export default async (page, params, cwd) => {
  const type = params.type;
  const region = params.region;
  const interest = params.interest;
  const sort = params.sort;

  if (!TYPES.includes(type)) {
    throw fail("INVALID_PARAM", "type must be one of: featured | shopping | search");
  }
  const regionCode = REGION_MAP[region];
  if (!regionCode) {
    throw fail("INVALID_PARAM", "unknown region: " + region);
  }
  if (!/^\d+$/.test(String(params.limit).trim())) {
    throw fail("INVALID_PARAM", "limit must be an integer between 1 and 100");
  }
  const limit = Math.max(1, Math.min(100, parseInt(params.limit, 10)));

  if (type === "featured") {
    const interestValue = INTEREST_MAP[interest];
    if (!interestValue) {
      throw fail("INVALID_PARAM", "unknown interest: " + interest);
    }
    return extractFeatured(page, regionCode, interestValue, limit);
  }
  if (type === "shopping") {
    return extractShopping(page, regionCode, limit);
  }
  if (type === "search") {
    if (!SORT_MAP[sort]) {
      throw fail("INVALID_PARAM", "unknown sort: " + sort);
    }
    return extractSearch(page, regionCode, sort, limit);
  }
  throw fail("INVALID_PARAM", "unreachable type: " + type);
};
