const API_BASE = "https://dev.to/api/users/by_username";
const PAGE_BASE = "https://dev.to";

// Allowed DEV.to username characters and length
const USERNAME_RE = /^[a-zA-Z0-9_-]{2,30}$/;

function compact(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function parseApiDate(dateStr) {
  if (!dateStr) return null;
  // API returns locale-style dates such as "Dec 27, 2015".
  // Force UTC interpretation so the result is deterministic.
  const d = new Date(`${dateStr} UTC`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function fetchUserApi(username) {
  const url = `${API_BASE}?url=${encodeURIComponent(username)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.forem.api-v1+json" },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function extractFromPage(page) {
  // Neutral interaction: random delay and small scroll to keep the interaction pattern neutral.
  await page.waitForTimeout(1000 + Math.floor(Math.random() * 1500));
  await page.evaluate(() => {
    const distance = Math.max(
      100,
      Math.floor(window.innerHeight * (0.2 + Math.random() * 0.3))
    );
    window.scrollBy({ top: distance, behavior: "smooth" });
  });

  const viewport = (await page.viewportSize()) || { width: 1280, height: 720 };
  const x = Math.floor(Math.random() * viewport.width);
  const y = Math.floor(Math.random() * viewport.height);
  await page.mouse.move(x, y);

  // Wait for the primary profile container.
  const header = await page.waitForSelector(".profile-header", { timeout: 10000 });
  if (!header) {
    throw makeError("DRIFT_DETECTED", "Profile header not found");
  }

  return page.evaluate(() => {
    const header = document.querySelector(".profile-header");

    const nameEl = header.querySelector("h1");
    const name = nameEl
      ? Array.from(nameEl.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join("")
          .trim()
      : null;

    const bioEl = header.querySelector(".profile-header__bio");
    const summary = bioEl ? bioEl.innerText.trim() : null;

    const img = header.querySelector("img.crayons-avatar__image");
    const profileImage = img ? img.src : null;

    const followBtn = header.querySelector("button.follow-user");
    let id = null;
    if (followBtn && followBtn.dataset.info) {
      try {
        id = JSON.parse(followBtn.dataset.info).id;
      } catch {
        id = null;
      }
    }

    const result = {
      type_of: "user",
      id,
      username: location.pathname.replace(/^\//, ""),
      name,
      summary,
      profile_image: profileImage,
      twitter_username: null,
      github_username: null,
      website_url: null,
      email: null,
      location: null,
      joined_at: null,
      badge_ids: [],
    };

    header.querySelectorAll(".profile-header__meta__item").forEach((item) => {
      const link = item.tagName === "A" ? item : item.querySelector("a[href]");
      const text = item.innerText.trim();
      const title = item.querySelector("svg title")?.textContent;

      if (link && /^mailto:/.test(link.href)) {
        result.email = link.href.replace("mailto:", "");
      } else if (link && /^https?:\/\//.test(link.href)) {
        const tw = link.href.match(/(?:twitter|x)\.com\/([^/?]+)/);
        const gh = link.href.match(/github\.com\/([^/?]+)/);
        if (tw) result.twitter_username = tw[1];
        else if (gh) result.github_username = gh[1];
        else result.website_url = link.href;
      }

      if (title === "Location") result.location = text;
      if (title === "Joined") {
        const time = item.querySelector("time");
        result.joined_at = time
          ? time.getAttribute("datetime")
          : text.replace(/^Joined on\s*/, "");
      }
    });

    return result;
  });
}

export default async (page, params, cwd) => {
  const username = params.username?.trim();
  if (!username) {
    throw makeError("INVALID_PARAM", "username is required");
  }
  if (!USERNAME_RE.test(username)) {
    throw makeError("INVALID_PARAM", `invalid username format: ${username}`);
  }

  let rateLimited = false;

  // API-first path
  if (process.env.DEVTO_GET_USER_FORCE_BROWSER !== "1") {
    try {
      const res = await fetchUserApi(username);

      if (res.status === 404) {
        throw makeError("NOT_FOUND", `user not found: ${username}`);
      }
      if (res.status === 429) {
        rateLimited = true;
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      } else {
        const body = await res.json();
        if (!body || body.type_of !== "user") {
          throw makeError("EMPTY_RESULT", `unexpected API response for ${username}`);
        }
        return compact({
          source: "api",
          type_of: "user",
          id: body.id,
          username: body.username,
          name: body.name,
          summary: body.summary,
          twitter_username: body.twitter_username,
          github_username: body.github_username,
          email: body.email,
          location: body.location,
          website_url: body.website_url,
          joined_at: parseApiDate(body.joined_at),
          profile_image: body.profile_image,
          badge_ids: Array.isArray(body.badge_ids) ? body.badge_ids : [],
        });
      }
    } catch (err) {
      if (err.code === "NOT_FOUND" || err.code === "EMPTY_RESULT" || err.code === "INVALID_PARAM") {
        throw err;
      }
      // Any other API failure triggers the browser fallback path.
      if (err.message && err.message.includes("429")) {
        rateLimited = true;
      }
    }
  }

  // Browser fallback path
  const url = `${PAGE_BASE}/${username}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch (err) {
    if (rateLimited) {
      throw makeError("RATE_LIMITED", `API rate limited and browser fallback failed for ${username}`);
    }
    throw makeError("NETWORK_ERROR", `failed to load profile page: ${err.message}`);
  }

  const title = await page.title();
  const h1Text = await page
    .$eval("h1", (el) => el.innerText)
    .catch(() => "");
  if (title.includes("404") || h1Text.includes("doesn't exist")) {
    throw makeError("NOT_FOUND", `user not found: ${username}`);
  }

  try {
    const data = compact(await extractFromPage(page));
    if (!data.name && !data.summary && !data.profile_image) {
      throw makeError("EMPTY_RESULT", `profile page loaded but no user data found for ${username}`);
    }
    return { source: "browser", ...data };
  } catch (err) {
    if (err.code === "DRIFT_DETECTED" || err.code === "EMPTY_RESULT") {
      throw err;
    }
    if (rateLimited) {
      throw makeError("RATE_LIMITED", `API rate limited and browser fallback failed for ${username}: ${err.message}`);
    }
    throw makeError("NETWORK_ERROR", `browser fallback failed for ${username}: ${err.message}`);
  }
};
