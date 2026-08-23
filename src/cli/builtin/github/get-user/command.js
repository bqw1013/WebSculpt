export default async (page, params, cwd) => {
  const userRaw = (params.user || "").trim();

  // ---- Normalize + validate user param (username or full profile URL) ----
  let login = null;
  const clean = userRaw.replace(/\/+$/, "");
  const urlMatch = clean.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/?#]+)/i);
  if (urlMatch) {
    login = urlMatch[1];
  } else if (clean && !clean.includes("/")) {
    login = clean;
  }
  // GitHub username: alphanumeric/hyphens, no leading/trailing hyphen, max 39 chars
  const safe = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
  if (!login || !safe.test(login)) {
    const err = new Error("[INVALID_PARAM] user must be a GitHub username (e.g. torvalds) or a full profile URL (https://github.com/torvalds)");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const url = "https://github.com/" + login;

  // ---- Rate awareness: random wait before navigation ----
  await page.waitForTimeout(200 + Math.floor(Math.random() * 500));

  let response = null;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    const err = new Error("[NETWORK_ERROR] Failed to load profile page: " + (e && e.message ? e.message : e));
    err.code = "NETWORK_ERROR";
    throw err;
  }

  // ---- Fail-fast: 404 / rate-limited ----
  if (response) {
    if (response.status() === 404) {
      const err = new Error("[NOT_FOUND] User or organization not found: " + login);
      err.code = "NOT_FOUND";
      throw err;
    }
    if (response.status() === 429 || response.status() === 403) {
      const err = new Error("[NETWORK_ERROR] GitHub rate-limited or blocked the request (HTTP " + response.status() + "). Slow down and retry.");
      err.code = "NETWORK_ERROR";
      throw err;
    }
  }
  const pageTitle = await page.title().catch(() => "");
  if (/Page not found/i.test(pageTitle)) {
    const err = new Error("[NOT_FOUND] User or organization not found: " + login);
    err.code = "NOT_FOUND";
    throw err;
  }

  // ---- Wait for the profile area (user vcard or org header) ----
  await page.waitForSelector('.p-nickname.vcard-username, header.pagehead.orghead', { state: "attached", timeout: 15000 });

  // ---- Polite pacing: gentle random scroll + mouse move + wait (hydration) ----
  await page.evaluate(() => {
    window.scrollBy(0, 40 + Math.floor(Math.random() * 200));
  }).catch(() => {});
  await page.mouse.move(120 + Math.floor(Math.random() * 500), 100 + Math.floor(Math.random() * 300)).catch(() => {});
  await page.waitForTimeout(300 + Math.floor(Math.random() * 400));

  // ---- Extract DOM profile fields (SSR + hydration) ----
  const domData = await page.evaluate((loginName) => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => Array.from(document.querySelectorAll(s));
    const txt = (el) => el ? el.textContent.replace(/\s+/g, " ").trim() : null;

    const isOrg = !!document.querySelector("header.pagehead.orghead");
    const out = {
      login: null, name: null, avatar: null, isOrg,
      bio: null, company: null, blog: null, location: null, email: null,
      socials: [], twitter: null, followersText: null, followingText: null,
      publicReposBadge: null, orgDescription: null
    };

    // Anchor whose visible text ends with "followers"/"following" (works for user + org)
    const countLink = (suffix) => {
      const el = qa("a").find((a) => {
        const t = (a.textContent || "").replace(/\s+/g, " ").trim();
        return t.toLowerCase().endsWith(suffix);
      });
      return el ? txt(el) : null;
    };

    if (isOrg) {
      out.name = txt(q("header.pagehead h1"));
      const av = q("header.pagehead img.avatar");
      out.avatar = av ? av.getAttribute("src") : null;
      out.orgDescription = txt(q(".js-profile-editable-replace .color-fg-muted div"));
      out.location = txt(q('[itemprop="location"]'));
      const blogA = q('[itemprop="url"]');
      if (blogA) out.blog = blogA.getAttribute("href") || txt(blogA);
      out.followersText = countLink("followers");
      const repoTab = qa("a").find((a) => a.textContent.includes("Repositories"));
      out.publicReposBadge = repoTab ? txt(repoTab) : null;
    } else {
      out.login = txt(q(".p-nickname.vcard-username"));
      out.name = txt(q(".p-name.vcard-fullname"));
      const av = q("img.avatar-user") || q(".vcard-avatar img");
      out.avatar = av ? av.getAttribute("src") : null;
      const bioEl = q(".p-note.user-profile-bio");
      if (bioEl) {
        const b = bioEl.getAttribute("data-bio-text");
        out.bio = b && b.trim() !== "" ? b : (bioEl.hidden ? null : txt(bioEl));
      }
      qa(".vcard-details li.vcard-detail").forEach((li) => {
        const itemprop = li.getAttribute("itemprop");
        const a = li.querySelector("a");
        const text = txt(li);
        if (itemprop === "worksFor") {
          out.company = text;
        } else if (itemprop === "homeLocation") {
          out.location = text;
        } else if (itemprop === "email") {
          out.email = a && a.getAttribute("href") === "mailto:" + text ? text : (text || null);
        } else if (itemprop === "url") {
          out.blog = a ? (a.getAttribute("href") || text) : text;
        } else if (itemprop === "social") {
          const titleEl = li.querySelector("svg title");
          out.socials.push({
            label: titleEl ? titleEl.textContent.trim() : null,
            handle: a ? txt(a) : text,
            url: a ? a.getAttribute("href") : null
          });
        }
      });
      out.followersText = countLink("followers");
      out.followingText = countLink("following");
      const repoTab = qa("a").find((a) => a.textContent.includes("Repositories"));
      out.publicReposBadge = repoTab ? txt(repoTab) : null;
    }

    // Twitter/X handle from social items (host twitter.com / x.com)
    for (const s of out.socials) {
      const host = s.url ? ((s.url.match(/^https?:\/\/([^\/]+)/) || [])[1] || "") : "";
      if (host === "twitter.com" || host === "x.com" || host === "www.twitter.com" || host === "www.x.com") {
        out.twitter = (s.handle || "").replace(/^@/, "") || null;
        break;
      }
    }
    return out;
  }, login);

  // ---- REST enrich (exact counts) from the page context (CORS allowed) ----
  let rest = null;
  try {
    rest = await page.evaluate(async (loginName) => {
      const r = await fetch("https://api.github.com/users/" + loginName, {
        headers: { accept: "application/vnd.github+json" }
      });
      if (r.status === 200) {
        const j = await r.json();
        return {
          type: j.type, name: j.name, avatar_url: j.avatar_url, bio: j.bio,
          company: j.company, blog: j.blog, location: j.location, email: j.email,
          twitter_username: j.twitter_username, public_repos: j.public_repos,
          public_gists: j.public_gists, followers: j.followers, following: j.following,
          created_at: j.created_at
        };
      }
      return { status: r.status };
    }, login);
  } catch (e) {
    rest = null;
  }

  if (rest && rest.status === 404) {
    const err = new Error("[NOT_FOUND] User or organization not found: " + login);
    err.code = "NOT_FOUND";
    throw err;
  }
  if (rest && (rest.status === 403 || rest.status === 429)) {
    rest = null; // rate-limited -> fall back to DOM abbreviated values
  }
  const restOk = !!(rest && rest.type);

  // ---- Parse DOM abbreviated counts ----
  const parseAbbrev = (s) => {
    if (!s) return null;
    const m = s.match(/([\d.,]+)\s*([kKmM]?)/);
    if (!m) return null;
    const num = parseFloat(m[1].replace(/,/g, ""));
    const mult = m[2] ? (m[2].toLowerCase() === "k" ? 1000 : 1000000) : 1;
    return Math.round(num * mult);
  };
  const parseRepoBadge = (s) => {
    if (!s) return null;
    const m = s.match(/Repositories\s*[\d.,]+[kKmM]?\s*\(([\d.,]+[kKmM]?)\)/);
    if (!m) return null;
    if (!/[kKmM]/.test(m[1])) return parseInt(m[1].replace(/,/g, ""), 10);
    return parseAbbrev(m[1]);
  };

  const cleanStr = (v) => (v == null || v === "" ? null : v);

  // ---- Merge DOM + REST (REST exact counts preferred; DOM fallback when rate-limited) ----
  const type = restOk && rest.type ? rest.type : (domData.isOrg ? "Organization" : "User");
  const name = restOk && rest.name ? rest.name : domData.name;
  const avatarUrl = restOk && rest.avatar_url ? rest.avatar_url : domData.avatar;
  const bio = restOk && rest.bio != null ? rest.bio : (domData.bio || domData.orgDescription || null);
  const company = restOk && rest.company != null ? rest.company : (domData.company || null);
  const blog = restOk && rest.blog ? rest.blog : (domData.blog || null);
  const location = restOk && rest.location != null ? rest.location : (domData.location || null);
  const email = domData.email || (restOk && rest.email) || null;
  const twitter = domData.twitter || (restOk && rest.twitter_username) || null;
  const publicRepos = restOk && rest.public_repos != null ? rest.public_repos : parseRepoBadge(domData.publicReposBadge);
  const publicGists = restOk && rest.public_gists != null ? rest.public_gists : null;
  const followers = restOk && rest.followers != null ? rest.followers : parseAbbrev(domData.followersText);
  const following = restOk && rest.following != null ? rest.following : parseAbbrev(domData.followingText);
  const createdAt = restOk && rest.created_at ? rest.created_at : null;

  const result = {
    login: domData.login || login,
    name: cleanStr(name),
    type: type || null,
    avatar_url: cleanStr(avatarUrl),
    html_url: "https://github.com/" + login,
    bio: cleanStr(bio),
    company: cleanStr(company),
    blog: cleanStr(blog),
    location: cleanStr(location),
    email: cleanStr(email),
    twitter: cleanStr(twitter),
    public_repos: publicRepos != null ? publicRepos : null,
    public_gists: publicGists != null ? publicGists : null,
    followers: followers != null ? followers : null,
    following: following != null ? following : null,
    created_at: createdAt || null,
    socials: domData.socials || []
  };

  // ---- EMPTY_RESULT guard: page loaded but no profile data extracted ----
  if (!result.login && !result.name && !result.type) {
    const err = new Error("[EMPTY_RESULT] No profile data could be extracted");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  return result;
};
