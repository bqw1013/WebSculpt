// quora/get-profile
// Fetches a Quora user's public profile metadata and one content section.

const ALLOWED_SECTIONS = [
  "profile",
  "answers",
  "questions",
  "posts",
  "followers",
  "following",
  "log",
];

// Convert Quora count shorthand like "1.5K", "200K", "1.2M" to a number.
function parseCount(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim().toUpperCase();
  if (!cleaned) return null;
  const match = cleaned.match(/^([0-9.]+)\s*([KMB]?)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  const multipliers = { "": 1, K: 1000, M: 1000000, B: 1000000000 };
  return Math.round(num * (multipliers[suffix] || 1));
}

// Convert Quora count text (which may already be numeric) to number.
function parseCountText(text) {
  if (!text) return null;
  const m = text.match(/([\d,.]+)\s*([KMB]?)/i);
  if (!m) return null;
  return parseCount(m[0]);
}

// Validate the --limit parameter.
function validateLimit(value) {
  if (value === undefined || value === null || value === "") return 20;
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) {
    const err = new Error("[INVALID_PARAM] limit must be a number");
    err.code = "INVALID_PARAM";
    throw err;
  }
  if (n < 1 || n > 100) {
    const err = new Error("[INVALID_PARAM] limit must be between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }
  return n;
}

// Small randomized wait to mimic human pauses.
async function humanWait(page, minMs, maxMs) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await page.waitForTimeout(delay);
}

// Move mouse and optionally scroll to keep polite pacing.
async function humanBehavior(page, scrollDy = 0) {
  const viewport = await page.viewportSize();
  const width = viewport ? viewport.width : 1280;
  const height = viewport ? viewport.height : 720;
  const x = Math.min(width - 10, Math.max(10, 100 + Math.random() * 300));
  const y = Math.min(height - 10, Math.max(10, 200 + Math.random() * 300));
  await page.mouse.move(x, y);
  await humanWait(page, 300, 800);
  if (scrollDy !== 0) {
    await page.mouse.wheel(0, scrollDy + Math.random() * 200);
    await humanWait(page, 800, 1500);
  }
}

// Build the section URL. The default "profile" section uses the bare profile URL.
function buildProfileUrl(name, section) {
  const encodedName = encodeURIComponent(name);
  if (section === "profile" || section === "") {
    return `https://www.quora.com/profile/${encodedName}`;
  }
  return `https://www.quora.com/profile/${encodedName}/${section}`;
}

// Extract text between two markers, returning trimmed lines.
function extractBetween(text, startMarker, endMarker, maxLength = 1000) {
  const startIdx = text.indexOf(startMarker);
  if (startIdx === -1) return null;
  const afterStart = text.substring(startIdx + startMarker.length);
  const endIdx = endMarker ? afterStart.indexOf(endMarker) : -1;
  const slice = endIdx !== -1 ? afterStart.substring(0, endIdx) : afterStart.substring(0, maxLength);
  return slice
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// Clean a credential line that sometimes starts with a collapsed "More" label.
function cleanCredential(text) {
  if (!text) return text;
  return text.replace(/^More\s*[\n\r]+/, "").trim();
}

// Extract profile metadata from the rendered body text.
function extractProfileMetadata(text, slug) {
  const meta = {
    name: slug,
    profileUrl: `https://www.quora.com/profile/${encodeURIComponent(slug)}`,
    credential: null,
    bio: null,
    followerCount: null,
    followingCount: null,
    counts: {
      answers: null,
      questions: null,
      posts: null,
    },
    totalContentViews: null,
    monthlyContentViews: null,
    joinDate: null,
    knownLanguages: [],
    credentials: [],
    activeSpaces: [],
    isPublishedWriter: false,
  };

  // Header block: between "Add question" and "Follow\nNotify me\nAsk".
  const headerLines = extractBetween(text, "Add question", "Follow\nNotify me\nAsk", 800);
  if (headerLines && headerLines.length >= 3) {
    meta.name = headerLines[0];
    meta.credential = cleanCredential(headerLines[1]);
    const followerMatch = headerLines[2].match(/^([\d,.]+[KMB]?)\s+followers?$/i);
    if (followerMatch) meta.followerCount = parseCountText(followerMatch[1]);
    if (headerLines[3]) {
      const followingMatch = headerLines[3].match(/^([\d,.]+[KMB]?)\s+following$/i);
      if (followingMatch) meta.followingCount = parseCountText(followingMatch[1]);
    }
  }

  // Fallback regexes if header extraction failed.
  if (!meta.followerCount) {
    const m = text.match(/([\d,.]+[KMB]?)\s+followers?/i);
    if (m) meta.followerCount = parseCountText(m[1]);
  }
  if (!meta.followingCount) {
    const m = text.match(/([\d,.]+[KMB]?)\s+following/i);
    if (m) meta.followingCount = parseCountText(m[1]);
  }
  if (!meta.credential) {
    const m = text.match(new RegExp(`${slug.replace(/-/g, "[- ]")}\\n([^\\n]{2,200})\\n`, "i"));
    if (m) meta.credential = cleanCredential(m[1].trim());
  }

  // Bio: text between "Ask" and "Profile".
  const bioLines = extractBetween(text, "Ask", "Profile", 600);
  if (bioLines) {
    meta.bio = bioLines.filter((l) => !l.includes("Skip to")).join(" ") || null;
  }

  // Tab counts appear after the first "Profile" label, before "Credentials & Highlights".
  const tabBlock = extractBetween(text, "Profile", "Credentials & Highlights", 400);
  if (tabBlock) {
    const tabText = tabBlock.join(" ");
    const am = tabText.match(/([\d,.]+[KMB]?)\s+Answers?\b/i);
    if (am) meta.counts.answers = parseCountText(am[1]);
    const qm = tabText.match(/([\d,.]+[KMB]?)\s+Questions?\b/i);
    if (qm) meta.counts.questions = parseCountText(qm[1]);
    const pm = tabText.match(/([\d,.]+[KMB]?)\s+Posts?\b/i);
    if (pm) meta.counts.posts = parseCountText(pm[1]);
  }

  // Fallback tab counts from whole text.
  if (!meta.counts.answers) {
    const m = text.match(/([\d,.]+[KMB]?)\s+Answers?\b/i);
    if (m) meta.counts.answers = parseCountText(m[1]);
  }
  if (!meta.counts.questions) {
    const m = text.match(/([\d,.]+[KMB]?)\s+Questions?\b/i);
    if (m) meta.counts.questions = parseCountText(m[1]);
  }
  if (!meta.counts.posts) {
    const m = text.match(/([\d,.]+[KMB]?)\s+Posts?\b/i);
    if (m) meta.counts.posts = parseCountText(m[1]);
  }

  // Content views: Quora sometimes concatenates "views" and the count without space.
  const viewsMatch = text.match(/([\d,.]+[KMB]?)\s*content views?\s*([\d,.]+[KMB]?)/i);
  if (viewsMatch) {
    meta.totalContentViews = viewsMatch[1];
    const monthlyMatch = text.match(/([\d,.]+[KMB]?)\s*this month/i);
    if (monthlyMatch) meta.monthlyContentViews = monthlyMatch[1];
  }

  // Join date.
  const joinMatch = text.match(/Joined\s+([A-Za-z]+\s+\d{4})/);
  if (joinMatch) meta.joinDate = joinMatch[1];

  // Languages.
  const knowsMatch = text.match(/Knows\s+([A-Za-z\s,]+)(?:\n|$)/);
  if (knowsMatch) {
    meta.knownLanguages = knowsMatch[1]
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  // Published writer flag.
  meta.isPublishedWriter = /Published Writer/i.test(text);

  // Sidebar credentials.
  const credBlock = extractBetween(text, "Credentials & Highlights", "Active in", 1200);
  if (credBlock) {
    const credText = credBlock.join("\n");
    // Employment: "Founder at BeBusinessSmart.com2019–present" (no space before year).
    const empMatch = credText.match(/([A-Za-z\s&.,'@()-]+?)\s*(\d{4})\s*[-–]\s*(?:present|current)/i);
    if (empMatch) {
      meta.credentials.push({
        type: "employment",
        text: cleanCredential(`${empMatch[1].trim()} ${empMatch[2]}–present`),
      });
    }
    const eduMatch = credText.match(/([A-Za-z\s&.,'()-]+?)\s+from\s+([A-Za-z\s&.,'()-]+?)\s+Graduated\s+(\d{4})/i);
    if (eduMatch) {
      meta.credentials.push({
        type: "education",
        text: `${eduMatch[1].trim()} from ${eduMatch[2].trim()} (${eduMatch[3]})`,
      });
    }
    const locMatch = credText.match(/Lived in\s+([A-Za-z\s,.'-]+)/i);
    if (locMatch) {
      meta.credentials.push({ type: "location", text: `Lived in ${locMatch[1].trim()}` });
    }

    // Active spaces: find lines that are space names followed by role/item count.
    for (let i = 0; i < credBlock.length - 1; i++) {
      const line = credBlock[i];
      const next = credBlock[i + 1];
      const roleMatch = next.match(/^(Admin|Moderator|Contributor)\s*[·|]\s*([\d,]+)\s+items$/);
      if (roleMatch && line.length >= 2 && line.length <= 80 && !line.includes("·")) {
        meta.activeSpaces.push({
          name: line,
          role: roleMatch[1],
          itemCount: parseInt(roleMatch[2].replace(/,/g, ""), 10),
        });
      }
    }
  }

  return meta;
}

// Wait for the section's primary content to render.
async function waitForSectionContent(page, section, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ready = await page.evaluate((sec) => {
      const text = document.body ? document.body.innerText : "";
      if (text.includes("Page Not Found")) return "not_found";
      if (text.includes("Something went wrong")) return "error";

      const isSpaceUrl = (href) => {
        try {
          const u = new URL(href, location.href);
          return u.hostname.endsWith(".quora.com") && u.hostname !== "www.quora.com";
        } catch {
          return false;
        }
      };
      const isSpacePostUrl = (href) => {
        try {
          const u = new URL(href, location.href);
          if (u.hostname === "www.quora.com") return false;
          if (!u.hostname.endsWith(".quora.com")) return false;
          if (/^[a-z]{2}\.quora\.com$/.test(u.hostname)) return false;
          if (u.pathname.startsWith("/profile/")) return false;
          if (u.pathname === "/") return false;
          return true;
        } catch {
          return false;
        }
      };
      const isSpaceHomeUrl = (href) => {
        try {
          const u = new URL(href, location.href);
          if (u.hostname === "www.quora.com") return false;
          if (!u.hostname.endsWith(".quora.com")) return false;
          if (/^[a-z]{2}\.quora\.com$/.test(u.hostname)) return false;
          if (u.pathname.startsWith("/profile/")) return false;
          return true;
        } catch {
          return false;
        }
      };
      const isQuoraAnswerLink = (a) => {
        try {
          const u = new URL(a.href, location.href);
          return u.hostname === "www.quora.com" && u.pathname.includes("/answer/");
        } catch {
          return a.href.includes("/answer/");
        }
      };

      switch (sec) {
        case "answers":
          return Array.from(document.querySelectorAll('a[href*="/answer/"]')).some(isQuoraAnswerLink);
        case "questions": {
          return Array.from(document.querySelectorAll("a")).some((a) => {
            const t = a.innerText.trim();
            if (!t.endsWith("?") || t.length <= 15 || t.includes("Skip to content")) return false;
            try {
              return new URL(a.href, location.href).hostname === "www.quora.com";
            } catch {
              return true;
            }
          });
        }
        case "posts":
          return Array.from(document.querySelectorAll("a")).some((a) => isSpacePostUrl(a.href));
        case "followers": {
          const own = document.querySelector('a[href*="/profile/"]');
          return Array.from(document.querySelectorAll('a[href*="/profile/"]')).some(
            (a) => a !== own && a.innerText.trim().length > 0
          );
        }
        case "following": {
          const spaceLinks = Array.from(document.querySelectorAll("a")).filter((a) => isSpaceHomeUrl(a.href));
          return spaceLinks.some((a) => {
            let card = a.parentElement;
            for (let i = 0; i < 6 && card; i++) {
              if (/followers?/i.test(card.innerText || "")) return true;
              card = card.parentElement;
            }
            return false;
          });
        }
        case "log":
          return /\b(Answer added|Comment added|Question added|Followed|Upvoted|Asked|Shared)\b.*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(
            text
          );
        case "profile":
        default:
          return true;
      }
    }, section);

    if (ready === "not_found") {
      const err = new Error("[NOT_FOUND] Quora profile or section not found");
      err.code = "NOT_FOUND";
      throw err;
    }
    if (ready === "error") {
      const err = new Error("[DRIFT_DETECTED] Quora returned a generic error page");
      err.code = "DRIFT_DETECTED";
      throw err;
    }
    if (ready) return;
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 200 + Math.random() * 200);
  }
  const err = new Error("[DRIFT_DETECTED] Section content did not load in time");
  err.code = "DRIFT_DETECTED";
  throw err;
}

// Wait for the section's primary content to render, allowing log to proceed
// even when Quora renders timestamps asynchronously.
async function waitForSectionContentOrTimeout(page, section, timeout = 20000) {
  try {
    await waitForSectionContent(page, section, timeout);
  } catch (e) {
    if (section === "log") return;
    throw e;
  }
}

// Scroll until we have at least `limit` items or the list stops growing.
async function scrollForMore(page, section, limit, targetName) {
  let lastCount = 0;
  let stale = 0;
  const targetSlug = targetName.toLowerCase().replace(/\s+/g, "-");
  const maxScrolls = Math.min(20, Math.ceil(limit / 3) + 3);
  for (let i = 0; i < maxScrolls; i++) {
    const count = await page.evaluate(
      ([sec, nameSlug]) => {
        const isSpaceUrl = (href) => {
          try {
            const u = new URL(href, location.href);
            return u.hostname.endsWith(".quora.com") && u.hostname !== "www.quora.com";
          } catch {
            return false;
          }
        };
        const isSpacePostUrl = (href) => {
          try {
            const u = new URL(href, location.href);
            if (u.hostname === "www.quora.com") return false;
            if (!u.hostname.endsWith(".quora.com")) return false;
            if (/^[a-z]{2}\.quora\.com$/.test(u.hostname)) return false;
            if (u.pathname.startsWith("/profile/")) return false;
            if (u.pathname === "/") return false;
            return true;
          } catch {
            return false;
          }
        };
        const isQuoraAnswerLink = (a) => {
          try {
            const u = new URL(a.href, location.href);
            return u.hostname === "www.quora.com" && u.pathname.includes("/answer/");
          } catch {
            return a.href.includes("/answer/");
          }
        };

        switch (sec) {
          case "answers":
            return Array.from(document.querySelectorAll('a[href*="/answer/"]')).filter(isQuoraAnswerLink).length;
          case "questions":
            return Array.from(document.querySelectorAll("a")).filter((a) => {
              const t = a.innerText.trim();
              return t.endsWith("?") && t.length > 15 && !t.includes("Skip to content");
            }).length;
          case "posts":
            return Array.from(document.querySelectorAll("a")).filter((a) => isSpacePostUrl(a.href)).length;
          case "followers":
          case "following":
            return Array.from(document.querySelectorAll('a[href*="/profile/"]')).filter(
              (a) => !a.href.toLowerCase().includes(`/profile/${nameSlug}`)
            ).length;
          case "log": {
            const main = document.querySelector("main") || document.body;
            return Array.from(main.querySelectorAll("div, span, p")).filter((el) =>
              /\b(Answer added|Comment added|Question added|Followed|Upvoted|Asked|Shared)\b.*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i.test(
                el.innerText
              )
            ).length;
          }
          default:
            return 0;
        }
      },
      [section, targetSlug]
    );
    if (count >= limit) break;
    if (count === lastCount) {
      stale++;
      if (stale >= 2) break;
    } else {
      stale = 0;
      lastCount = count;
    }
    await page.mouse.wheel(0, 700 + Math.random() * 300);
    await page.evaluate(() => {
      window.scrollBy(0, 800);
      const main = document.querySelector("main");
      if (main) main.scrollBy(0, 800);
    });
    await humanWait(page, 1200, 2500);
  }
}

// Extract section-specific items.
async function extractItems(page, section, targetName, limit) {
  return page.evaluate(
    ([sec, target, limit]) => {
      function parseCountText(value) {
        if (!value) return null;
        const cleaned = String(value).replace(/,/g, "").trim().toUpperCase();
        const match = cleaned.match(/^([0-9.]+)\s*([KMB]?)$/);
        if (!match) return null;
        const num = parseFloat(match[1]);
        const suffix = match[2];
        const multipliers = { "": 1, K: 1000, M: 1000000, B: 1000000000 };
        return Math.round(num * (multipliers[suffix] || 1));
      }

      const isSpaceUrl = (href) => {
        try {
          const u = new URL(href, location.href);
          return u.hostname.endsWith(".quora.com") && u.hostname !== "www.quora.com";
        } catch {
          return /^https?:\/\/[a-z0-9-]+\.quora\.com\//.test(href);
        }
      };
      const isSpacePostUrl = (href) => {
        // A Space-hosted post URL is a *.quora.com subdomain that does not point
        // to a profile page and is not a Quora language edition (e.g. es.quora.com).
        try {
          const u = new URL(href, location.href);
          if (u.hostname === "www.quora.com") return false;
          if (!u.hostname.endsWith(".quora.com")) return false;
          if (/^[a-z]{2}\.quora\.com$/.test(u.hostname)) return false;
          if (u.pathname.startsWith("/profile/")) return false;
          if (u.pathname === "/") return false;
          return true;
        } catch {
          return false;
        }
      };
      const isSpaceHomeUrl = (href) => {
        // A Space homepage URL on a *.quora.com subdomain, excluding Quora
        // language editions and profile pages.
        try {
          const u = new URL(href, location.href);
          if (u.hostname === "www.quora.com") return false;
          if (!u.hostname.endsWith(".quora.com")) return false;
          if (/^[a-z]{2}\.quora\.com$/.test(u.hostname)) return false;
          if (u.pathname.startsWith("/profile/")) return false;
          return true;
        } catch {
          return false;
        }
      };
      const isProfileLink = (href) => {
        try {
          const u = new URL(href, location.href);
          return u.hostname === "www.quora.com" && u.pathname.startsWith("/profile/");
        } catch {
          return href.includes("/profile/");
        }
      };
      const isQuoraAnswerLink = (a) => {
        try {
          const u = new URL(a.href, location.href);
          return u.hostname === "www.quora.com" && u.pathname.includes("/answer/");
        } catch {
          return a.href.includes("/answer/");
        }
      };

      // Find the most specific ancestor that contains one of the signal words.
      // This usually corresponds to a single feed card and avoids stopping at
      // the author-line wrapper (which is too shallow) or the whole page.
      function findCard(startEl, signals, maxDepth = 25) {
        const matches = [];
        let el = startEl;
        for (let i = 0; i < maxDepth && el; i++) {
          const text = (el.innerText || "").trim();
          const lower = text.toLowerCase();
          if (signals.some((s) => lower.includes(s.toLowerCase())) && text.length > 80) {
            matches.push({ el, len: text.length });
          }
          el = el.parentElement;
        }
        if (matches.length > 0) {
          matches.sort((a, b) => a.len - b.len);
          return matches[0].el;
        }
        // Fallback: first reasonably-sized ancestor.
        el = startEl;
        for (let i = 0; i < maxDepth && el; i++) {
          const text = (el.innerText || "").trim();
          if (text.length > 80) return el;
          el = el.parentElement;
        }
        return startEl;
      }

      // For following Spaces, make sure a card contains exactly one Space link.
      function refineSpaceCard(startEl, signal, linkFilter) {
        let el = startEl;
        for (let i = 0; i < 25 && el; i++) {
          const text = (el.innerText || "").trim();
          const lower = text.toLowerCase();
          const spaceLinks = Array.from(el.querySelectorAll("a")).filter(linkFilter);
          if (lower.includes(signal.toLowerCase()) && spaceLinks.length === 1 && text.length > 80) return el;
          el = el.parentElement;
        }
        return startEl;
      }

      // Pick the question title from a card: the longest text chunk ending in "?".
      function pickQuestionTitle(card) {
        const raw = card.innerText || "";
        const chunks = raw
          .split(/[\n·]/)
          .map((s) => s.trim())
          .filter((s) => s.endsWith("?") && s.length > 15 && !s.includes("Skip to content"));
        chunks.sort((a, b) => b.length - a.length);
        return chunks[0] || "";
      }

      const items = [];
      const seen = new Set();

      switch (sec) {
        case "answers": {
          const answerLinks = Array.from(document.querySelectorAll('a[href*="/answer/"]')).filter(isQuoraAnswerLink);
          for (const link of answerLinks) {
            const answerUrl = link.href;
            if (!answerUrl || seen.has(answerUrl)) continue;
            seen.add(answerUrl);

            const questionUrl = answerUrl.split("/answer/")[0];
            const card = findCard(link, ["Upvote", "Upvotes"]);
            const cardText = card.innerText.trim().replace(/\s+/g, " ");

            let questionTitle = pickQuestionTitle(card);

            // If the title-by-question-mark failed, try matching a link that points to the question URL.
            if (!questionTitle) {
              const candidateLinks = Array.from(card.querySelectorAll("a")).filter((a) => {
                try {
                  return new URL(a.href, location.href).href === questionUrl;
                } catch {
                  return false;
                }
              });
              if (candidateLinks.length > 0) {
                candidateLinks.sort((a, b) => b.innerText.trim().length - a.innerText.trim().length);
                questionTitle = candidateLinks[0].innerText.trim();
              }
            }
            if (!questionTitle) questionTitle = link.innerText.trim();

            // Upvote / comment / share counts after the "Upvote" label.
            let upvoteCount = null;
            let commentCount = null;
            let shareCount = null;
            const upvoteIdx = cardText.indexOf("Upvote");
            if (upvoteIdx !== -1) {
              const after = cardText.substring(upvoteIdx + 6);
              const nums = after.match(/\b\d{1,6}\b/g);
              if (nums) {
                upvoteCount = parseInt(nums[0], 10);
                if (nums[1]) commentCount = parseInt(nums[1], 10);
                if (nums[2]) shareCount = parseInt(nums[2], 10);
              }
            }

            // Relative time: tokens like "3y", "6h", "1y", or short day/month tokens.
            const timeMatch = cardText.match(/\b(\d+[hdwmy]|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i);
            const isPinned = /Pinned answer/i.test(cardText);

            items.push({
              questionTitle: questionTitle.substring(0, 200),
              questionUrl,
              answerUrl,
              publishedAt: timeMatch ? timeMatch[0] : null,
              upvoteCount,
              commentCount,
              shareCount,
              excerpt: cardText.substring(0, 300).trim(),
              isPinned,
            });
            if (items.length >= limit) break;
          }
          break;
        }

        case "questions": {
          const questionLinks = Array.from(document.querySelectorAll("a")).filter((a) => {
            const t = a.innerText.trim();
            return t.endsWith("?") && t.length > 15 && !t.includes("Skip to content");
          });
          for (const link of questionLinks) {
            const title = link.innerText.trim();
            const url = link.href;
            if (seen.has(url)) continue;
            seen.add(url);

            const card = findCard(link, ["answers", "Last followed"]);
            const ctx = card.innerText.trim().replace(/\s+/g, " ");
            const answerMatch = ctx.match(/([\d,.]+[KMB]?)\s+answers?/i);
            const followMatch = ctx.match(/Last followed\s+([^·\n]+?)(?:\s+Answer(?:\s|$)|$)/i);
            items.push({
              title: title.substring(0, 200),
              url,
              answerCount: answerMatch ? parseCountText(answerMatch[1]) : null,
              lastFollowedAt: followMatch ? followMatch[1].trim() : null,
            });
            if (items.length >= limit) break;
          }
          break;
        }

        case "posts": {
          // Quora posts appear as Space-hosted cards or reshared answers.
          // Use "Posted by" as the card marker, then locate the actual post link.
          const main = document.querySelector("main") || document.body;
          const postedByCandidates = Array.from(main.querySelectorAll("*")).filter((el) => {
            const text = el.innerText || "";
            if (!/Posted by/i.test(text)) return false;
            // Keep only small, leaf-like containers that contain a single "Posted by".
            if (text.length > 1500) return false;
            return (text.match(/Posted by/gi) || []).length === 1;
          });
          // Drop ancestors that are already represented by a smaller candidate.
          postedByCandidates.sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);
          const postedByEls = [];
          for (const el of postedByCandidates) {
            if (!postedByEls.some((chosen) => chosen.contains(el) || el.contains(chosen))) {
              postedByEls.push(el);
            }
          }
          const cards = [];
          for (const el of postedByEls) {
            const card = findCard(el, ["Posted by", "Upvote", "Comment", "(more)"]);
            if (!cards.includes(card)) cards.push(card);
          }

          for (let card of cards) {
            let rawCardText = card.innerText.trim();
            // Expand the card slightly if the action bar (with counts) is in a sibling.
            for (let i = 0; i < 3; i++) {
              const text = rawCardText;
              const postedByHits = (text.match(/Posted by/gi) || []).length;
              if ((/Upvote/i.test(text) || /\d+\s*\d*$/.test(text)) || text.length > 2500 || postedByHits > 1) break;
              if (card.parentElement) {
                card = card.parentElement;
                rawCardText = card.innerText.trim();
              }
            }
            const cardText = rawCardText.replace(/\s+/g, " ");

            // Find the Space home link (for spaceName/spaceUrl).
            const spaceHomeLink = Array.from(card.querySelectorAll("a")).find((a) => {
              try {
                const u = new URL(a.href, location.href);
                return u.hostname.endsWith(".quora.com") && u.hostname !== "www.quora.com" && !/^[a-z]{2}\.quora\.com$/.test(u.hostname);
              } catch {
                return false;
              }
            });

            // Find the actual post link: either a Space post or a reshared answer.
            let postLink = Array.from(card.querySelectorAll("a")).find((a) => {
              try {
                const u = new URL(a.href, location.href);
                if (u.hostname.endsWith(".quora.com") && u.hostname !== "www.quora.com" && !/^[a-z]{2}\.quora\.com$/.test(u.hostname) && u.pathname !== "/" && !u.pathname.startsWith("/profile/")) return true;
                if (u.hostname === "www.quora.com" && u.pathname.includes("/answer/")) return true;
                return false;
              } catch {
                return false;
              }
            });
            if (!postLink && spaceHomeLink) postLink = spaceHomeLink;
            if (!postLink) continue;

            const url = postLink.href;
            if (seen.has(url)) continue;
            seen.add(url);

            // Prefer the question title for reshared answers; otherwise use the
            // first content line that appears after the timestamp.
            let title = pickQuestionTitle(card);
            if (!title) {
              const lines = rawCardText.split("\n").map((s) => s.trim()).filter(Boolean);
              let afterTime = false;
              for (const line of lines) {
                if (/^\d+[hdwmy]$|^\d{1,2}:\d{2}$|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(line)) {
                  afterTime = true;
                  continue;
                }
                if (afterTime && line.length > 10 && !/^(Upvote|Comment|Share|Follow|Posted by)$/i.test(line)) {
                  title = line;
                  break;
                }
              }
            }
            if (!title || title.length < 3) title = postLink.innerText.trim();
            if (!title || title.length < 3) title = rawCardText.split("\n")[0];

            const spaceNameFromLink = spaceHomeLink ? spaceHomeLink.innerText.trim().split("\n")[0] : null;
            const spaceMatch = cardText.match(/^([^·]+?)\s*·\s*Follow/i);
            const timeMatch =
              cardText.match(/Posted by [^·]+·\s*([A-Za-z0-9,\s]+?)(?=\s+Upvote|\s+Comment|$)/i) ||
              cardText.match(/\b(\d+[hdwmy]|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);

            let upvoteCount = null;
            let commentCount = null;
            const nums = (cardText.match(/\b\d{1,6}\b/g) || []).map((n) => parseInt(n, 10));
            if (nums.length >= 1) upvoteCount = nums[0];
            if (nums.length >= 2) commentCount = nums[1];

            const spaceSlugMatch = spaceHomeLink
              ? spaceHomeLink.href.match(/https:\/\/([a-z0-9-]+)\.quora\.com\//)
              : url.match(/https:\/\/([a-z0-9-]+)\.quora\.com\//);
            items.push({
              spaceName: spaceNameFromLink || (spaceMatch ? spaceMatch[1].trim() : null),
              spaceUrl: spaceSlugMatch ? `https://${spaceSlugMatch[1]}.quora.com` : null,
              postUrl: url,
              title: title.substring(0, 200),
              excerpt: rawCardText.substring(0, 300).trim(),
              publishedAt: timeMatch ? timeMatch[1].trim() : null,
              upvoteCount,
              commentCount,
            });
            if (items.length >= limit) break;
          }
          break;
        }

        case "followers": {
          const profiles = Array.from(document.querySelectorAll('a[href*="/profile/"]')).filter(
            (a) =>
              isProfileLink(a.href) &&
              !a.href.toLowerCase().includes(`/profile/${target.toLowerCase().replace(/\s+/g, "-")}`)
          );
          for (const a of profiles) {
            const name = a.innerText.trim();
            const url = a.href;
            if (!name || seen.has(url)) continue;
            seen.add(url);
            items.push({ name: name.substring(0, 100), profileUrl: url });
            if (items.length >= limit) break;
          }
          break;
        }

        case "following": {
          // The /following tab lists Spaces, not users.
          const spaceLinks = Array.from(document.querySelectorAll("a")).filter((a) => {
            if (!isSpaceHomeUrl(a.href)) return false;
            // Ignore wrapper links that aggregate multiple Space entries.
            const followerHits = (a.innerText.match(/followers/gi) || []).length;
            return followerHits === 1;
          });
          for (const link of spaceLinks) {
            const url = link.href;
            if (seen.has(url)) continue;
            seen.add(url);

            const linkText = link.innerText.trim();
            const lines = linkText.split("\n").map((s) => s.trim()).filter(Boolean);
            if (lines.length < 2) continue;

            const name = lines[0];
            if (!name || name.length < 2) continue;

            const followerMatch = lines[1].match(/^([\d,.]+[KMB]?)\s+followers?$/i);
            const description = lines.slice(2).join(" ").substring(0, 300) || null;
            const spaceSlugMatch = url.match(/https:\/\/([a-z0-9-]+)\.quora\.com\//);
            items.push({
              spaceName: name.substring(0, 150),
              spaceUrl: spaceSlugMatch ? `https://${spaceSlugMatch[1]}.quora.com` : url,
              followerCount: followerMatch ? parseCountText(followerMatch[1]) : null,
              description,
            });
            if (items.length >= limit) break;
          }
          break;
        }

        case "log": {
          const main = document.querySelector("main") || document.body;
          const logEls = Array.from(main.querySelectorAll("div, span, p")).filter((el) => {
            const t = el.innerText.trim();
            return (
              /^\b(Answer added|Comment added|Question added|Followed|Upvoted|Asked|Shared)\b.*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s+\d{4})?\s+at\s+\d{1,2}:\d{2}(?::\d{2})?\s+(?:AM|PM)/is.test(t) &&
              !t.includes("Skip to content") &&
              !t.includes("Home Following Answer Spaces")
            );
          });
          for (const el of logEls) {
            const raw = el.innerText.trim().replace(/\s+/g, " ");
            if (seen.has(raw) || raw.length < 30) continue;
            seen.add(raw);
            const actionMatch = raw.match(/\b(Answer added|Comment added|Question added|Followed|Upvoted|Asked|Shared)\b/i);
            const timeMatch = raw.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s+\d{4})?\s+at\s+\d{1,2}:\d{2}(?::\d{2})?\s+(?:AM|PM)/i);
            let title = null;
            let targetUrl = null;
            if (actionMatch) {
              const firstLink = el.querySelector("a");
              if (firstLink) {
                targetUrl = firstLink.href;
                title = firstLink.innerText.trim().substring(0, 200);
              }
            }
            items.push({
              action: actionMatch ? actionMatch[1] : null,
              targetTitle: title,
              targetUrl,
              text: raw.substring(0, 400),
              publishedAt: timeMatch ? timeMatch[0] : null,
            });
            if (items.length >= limit) break;
          }
          break;
        }

        case "profile": {
          // Default feed: mixed recent activity. Extract answer cards first.
          const answerLinks = Array.from(document.querySelectorAll('a[href*="/answer/"]')).filter(isQuoraAnswerLink);
          for (const link of answerLinks.slice(0, limit)) {
            const url = link.href;
            if (seen.has(url)) continue;
            seen.add(url);
            const card = findCard(link, ["Upvote", "Upvotes"]);
            const cardText = card.innerText.trim().replace(/\s+/g, " ");
            const title = pickQuestionTitle(card) || link.innerText.trim();
            items.push({
              type: "answer",
              title: title.substring(0, 200),
              url,
              excerpt: cardText.substring(0, 250),
            });
            if (items.length >= limit) break;
          }
          break;
        }
      }

      return items;
    },
    [section, targetName, limit]
  );
}

export default async (page, params, cwd) => {
  if (!params.name || params.name.trim() === "") {
    const err = new Error("[MISSING_PARAM] name is required");
    err.code = "MISSING_PARAM";
    throw err;
  }
  const name = params.name.trim();

  const section = (params.section || "profile").trim().toLowerCase();
  if (!ALLOWED_SECTIONS.includes(section)) {
    const err = new Error(`[INVALID_PARAM] section must be one of: ${ALLOWED_SECTIONS.join(", ")}`);
    err.code = "INVALID_PARAM";
    throw err;
  }

  const limit = validateLimit(params.limit);

  const url = buildProfileUrl(name, section);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await humanWait(page, 1500, 3000);

  const initialText = await page.evaluate(() => (document.body ? document.body.innerText : ""));
  if (initialText.includes("Page Not Found")) {
    const err = new Error("[NOT_FOUND] Quora profile or section not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  await waitForSectionContentOrTimeout(page, section);
  await humanBehavior(page, 500);

  if (section !== "profile") {
    await scrollForMore(page, section, limit, name);
  }

  const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : ""));
  const profile = extractProfileMetadata(bodyText, name);

  const items = await extractItems(page, section, name, limit);

  if (section !== "profile" && items.length === 0) {
    const hasEmptySignal = /no\s+(answers|questions|posts|followers|following|edits)\s+yet|hasn'?t\s+(posted|answered|asked|followed)/i.test(bodyText);
    if (!hasEmptySignal) {
      const err = new Error("[DRIFT_DETECTED] Expected list content was not found");
      err.code = "DRIFT_DETECTED";
      throw err;
    }
  }

  const trimmed = items.slice(0, limit);

  return {
    profile,
    section,
    items: trimmed,
    count: trimmed.length,
    partial:
      items.length > trimmed.length ||
      (section !== "profile" &&
        trimmed.length < limit &&
        !/no\s+(answers|questions|posts|followers|following|edits)\s+yet/i.test(bodyText)),
  };
};
