// Fetch a DEV.to organization profile. API-first; fallback to browser page extraction.
export default async (page, params, cwd) => {
  const org = typeof params.org === "string" ? params.org.trim().toLowerCase() : "";
  if (!org || org.includes("/") || org.includes("\\")) {
    const err = new Error("[INVALID_PARAM] org is required and must be a single URL path segment");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const includeMembers = params.include_members === "true";
  const apiBase = "https://dev.to/api/organizations";
  const profileUrl = `https://dev.to/${encodeURIComponent(org)}`;

  // Helper: remove null/undefined fields from an object recursively.
  function compact(obj) {
    if (obj === null || obj === undefined) return undefined;
    if (Array.isArray(obj)) {
      return obj.map(compact).filter((v) => v !== undefined);
    }
    if (typeof obj === "object") {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        const cleaned = compact(v);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }
    return obj;
  }

  // Try the public Forem API first.
  let apiProfile = null;
  try {
    const res = await fetch(`${apiBase}/${encodeURIComponent(org)}`);
    if (res.status === 404) {
      const err = new Error(`[NOT_FOUND] Organization '${org}' was not found`);
      err.code = "NOT_FOUND";
      throw err;
    }
    if (res.status === 429 || res.status >= 500 || !res.ok) {
      // Rate-limit or other critical API failure: fall through to browser fallback.
      apiProfile = null;
    } else {
      apiProfile = await res.json();
    }
  } catch (e) {
    if (e.code === "NOT_FOUND" || e.code === "RATE_LIMITED" || e.code === "INVALID_PARAM") throw e;
    // Network or parse failure: proceed to browser fallback.
    apiProfile = null;
  }

  if (apiProfile) {
    if (apiProfile.type_of !== "organization") {
      const err = new Error("[EMPTY_RESULT] API response was not an organization profile");
      err.code = "EMPTY_RESULT";
      throw err;
    }

    const result = {
      source: "api",
      id: apiProfile.id,
      username: apiProfile.username,
      name: apiProfile.name,
      summary: apiProfile.summary,
      tag_line: apiProfile.tag_line,
      tech_stack: apiProfile.tech_stack,
      url: apiProfile.url,
      profile_image: apiProfile.profile_image,
      location: apiProfile.location,
      twitter_username: apiProfile.twitter_username,
      github_username: apiProfile.github_username,
      joined_at: apiProfile.joined_at,
      story: apiProfile.story,
    };

    if (includeMembers) {
      let membersFetched = false;
      let lastMembersStatus = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const membersRes = await fetch(`${apiBase}/${encodeURIComponent(org)}/users`);
          lastMembersStatus = membersRes.status;
          if (membersRes.ok) {
            const members = await membersRes.json();
            result.members = Array.isArray(members) ? members : [];
            membersFetched = true;
            break;
          }
          if (membersRes.status === 429) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      if (!membersFetched) {
        const code = lastMembersStatus === 429 ? "RATE_LIMITED" : "NETWORK_ERROR";
        const err = new Error(`[${code}] Failed to fetch member list for '${org}'`);
        err.code = code;
        throw err;
      }
    }

    return compact(result);
  }

  // Browser fallback path.
  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
  } catch (e) {
    const err = new Error(`[NETWORK_ERROR] Failed to load ${profileUrl}: ${e.message}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  // Wait for either the organization header or the 404 page.
  let ready = false;
  try {
    ready = await page.waitForFunction(
      () => {
        const h1 = document.querySelector("h1");
        const header = document.querySelector(".org-header-text");
        const notFound = document.title.startsWith("404:") ||
          (h1 && h1.innerText.includes("Looks like this page doesn't exist"));
        return { ready: header !== null || notFound, notFound };
      },
      { timeout: 15000 }
    );
  } catch (e) {
    const err = new Error(`[NETWORK_ERROR] Page did not settle: ${e.message}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  if (ready.notFound) {
    const err = new Error(`[NOT_FOUND] Organization '${org}' was not found`);
    err.code = "NOT_FOUND";
    throw err;
  }

  // Neutral interaction before DOM extraction.
  await page.waitForTimeout(400 + Math.floor(Math.random() * 400));
  await page.evaluate(() => window.scrollBy(0, 150 + Math.floor(Math.random() * 200)));
  await page.waitForTimeout(300 + Math.floor(Math.random() * 300));
  try {
    const viewport = page.viewportSize() || { width: 1280, height: 720 };
    await page.mouse.move(
      Math.floor(Math.random() * viewport.width),
      Math.floor(Math.random() * viewport.height)
    );
  } catch {
    // Mouse movement is optional; ignore failures.
  }

  const extracted = await page.evaluate(() => {
    const header = document.querySelector(".org-header-text");
    if (!header) return null;

    const nameEl = header.querySelector("h1");
    const name = nameEl ? nameEl.childNodes[0]?.textContent?.trim() : null;
    const tag_line = header.querySelector("p")?.innerText?.trim() || null;

    const details = document.querySelector(".org-header-main")?.nextElementSibling;
    const summary = details?.querySelector("p.fs-base.color-base-90")?.innerText?.trim() || null;
    const website = details?.querySelector('a[href^="https://"]:not([href*="twitter"]):not([href*="github"])')?.href || null;
    const twitter = details?.querySelector('a[href*="twitter.com"]')?.href || null;
    const github = details?.querySelector('a[href*="github.com"]')?.href || null;
    const joinedTime = details?.querySelector("time");
    const joined_at = joinedTime?.getAttribute("datetime") || null;

    const stackCard = [...document.querySelectorAll("h3")]
      .find((h) => h.innerText.includes("Our stack"))
      ?.closest(".crayons-card");
    const tech_stack = stackCard?.querySelector("p")?.innerText?.trim() || null;

    const logo = document.querySelector(".org-header-logo img")?.src || null;

    const text = document.body.innerText;
    const postsMatch = text.match(/(\d[\d,]*)\s+posts published/);
    const membersMatch = text.match(/(\d[\d,]*)\s+members/);

    const meetSection = [...document.querySelectorAll("h3")]
      .find((h) => h.innerText.includes("Meet the team"))
      ?.closest(".crayons-card");
    const members = [...(meetSection?.querySelectorAll('a[href^="/"]') || [])]
      .map((a) => {
        const m = a.getAttribute("href")?.match(/^\/([^/]+)$/);
        return m
          ? {
              username: m[1],
              profile_image: a.querySelector("img")?.src || null,
            }
          : null;
      })
      .filter(Boolean)
      .slice(0, 50);

    return {
      name,
      tag_line,
      summary,
      website,
      twitter,
      github,
      joined_at,
      tech_stack,
      profile_image: logo,
      posts_count: postsMatch ? postsMatch[1].replace(/,/g, "") : null,
      members_count: membersMatch ? membersMatch[1].replace(/,/g, "") : null,
      members,
    };
  });

  if (!extracted) {
    const err = new Error("[EMPTY_RESULT] Organization profile structure could not be read");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  const result = {
    source: "browser",
    username: org,
    name: extracted.name,
    summary: extracted.summary,
    tag_line: extracted.tag_line,
    tech_stack: extracted.tech_stack,
    url: page.url(),
    profile_image: extracted.profile_image,
    website: extracted.website,
    twitter: extracted.twitter,
    github: extracted.github,
    joined_at: extracted.joined_at,
  };

  if (includeMembers) {
    result.members = extracted.members;
  }

  return compact(result);
};
