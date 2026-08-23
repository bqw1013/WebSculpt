// techcrunch/get-article — fetch a single TechCrunch article's full content
// via the public WordPress REST API (no auth, no browser required).

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Decode HTML entities (named subset + numeric decimal/hex) to plain text.
function decodeEntities(str) {
  if (!str) return "";
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    hellip: "…",
    bull: "•",
    copy: "©",
    reg: "®",
    trade: "™",
    deg: "°",
    times: "×",
    divide: "÷",
  };
  return str.replace(
    /&#x([0-9a-fA-F]+);|&#(\d+);|&([a-zA-Z]+);/g,
    (m, hex, dec, name) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      if (dec) return String.fromCodePoint(parseInt(dec, 10));
      return named[name] !== undefined ? named[name] : m;
    }
  );
}

// Convert HTML to plain text: drop script/style, keep paragraph breaks,
// strip tags, decode entities, collapse whitespace.
function htmlToText(html) {
  if (!html) return "";
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/?[^>]+>/g, " ");
  text = decodeEntities(text);
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/[ \t]*\n[ \t]*/g, "\n");
  text = text.replace(/\n\s*\n+/g, "\n\n");
  return text.trim();
}

// Extract the article slug from a full URL, a path-only string, or a bare slug.
function extractSlug(input) {
  const raw = (input || "").trim().replace(/\/+$/, "");
  if (!raw) return { ok: false };

  if (/^https?:\/\//i.test(raw)) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return { ok: false };
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== "techcrunch.com" && host !== "www.techcrunch.com") {
      return { ok: false, reason: "NOT_TECHCRUNCH" };
    }
    const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) return { ok: false };
    return { ok: true, slug: decodeURIComponent(segments[segments.length - 1]) };
  }

  if (raw.startsWith("/")) {
    const segments = raw.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) return { ok: false };
    return { ok: true, slug: decodeURIComponent(segments[segments.length - 1]) };
  }

  return { ok: true, slug: raw };
}

export default async function (params) {
  const rawUrl = (params.url || "").trim();
  if (!rawUrl) {
    const err = new Error("[MISSING_PARAM] Missing required parameter 'url' (full article URL or slug)");
    err.code = "MISSING_PARAM";
    throw err;
  }

  const slugRes = extractSlug(rawUrl);
  if (!slugRes.ok) {
    const detail =
      slugRes.reason === "NOT_TECHCRUNCH"
        ? "URL host must be techcrunch.com"
        : "could not extract an article slug";
    const err = new Error("[INVALID_PARAM] Invalid 'url' (" + detail + "): " + rawUrl);
    err.code = "INVALID_PARAM";
    throw err;
  }
  const slug = slugRes.slug;
  if (!/^[a-z0-9-]+$/i.test(slug)) {
    const err = new Error("[INVALID_PARAM] Unsupported article slug '" + slug + "'");
    err.code = "INVALID_PARAM";
    throw err;
  }

  // Polite pacing: random 200-700ms sleep before each request.
  await sleep(200 + Math.floor(Math.random() * 500));

  const apiUrl =
    "https://techcrunch.com/wp-json/wp/v2/posts?slug=" +
    encodeURIComponent(slug) +
    "&_embed=1";

  let res;
  try {
    res = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
    });
  } catch (e) {
    const err = new Error("[NETWORK_ERROR] Request to TechCrunch API failed: " + e.message);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  if (!res.ok) {
    const err = new Error("[API_ERROR] TechCrunch API returned HTTP " + res.status);
    err.code = "API_ERROR";
    throw err;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error("[DRIFT_DETECTED] TechCrunch API returned an unparsable body");
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  if (!Array.isArray(data)) {
    const err = new Error("[DRIFT_DETECTED] TechCrunch API response shape changed (expected array)");
    err.code = "DRIFT_DETECTED";
    throw err;
  }
  if (data.length === 0) {
    const err = new Error("[NOT_FOUND] No article found for slug '" + slug + "'");
    err.code = "NOT_FOUND";
    throw err;
  }

  const post = data[0];
  const embedded = post._embedded || {};
  const termGroups = embedded["wp:term"] || [];

  const categories = [];
  const tags = [];
  let authorSlug = null;
  for (const group of termGroups) {
    if (!Array.isArray(group)) continue;
    for (const term of group) {
      if (!term || typeof term.slug !== "string") continue;
      const tax = term.taxonomy || "";
      if (tax === "category") {
        categories.push(term.slug);
      } else if (tax === "post_tag") {
        tags.push(term.slug);
      } else if (tax === "author" && term.slug.indexOf("cap-") === 0 && authorSlug === null) {
        authorSlug = term.slug.slice(4);
      }
    }
  }

  const featured = (embedded["wp:featuredmedia"] && embedded["wp:featuredmedia"][0]) || null;
  const image = featured && featured.source_url ? featured.source_url : null;

  const authorName = (post.yoast_head_json && post.yoast_head_json.author) || null;
  const profileUrl = authorSlug ? "https://techcrunch.com/author/" + authorSlug + "/" : null;

  const titleHtml = (post.title && post.title.rendered) || "";
  const contentHtml = (post.content && post.content.rendered) || "";
  const contentText = htmlToText(contentHtml);
  const excerpt = htmlToText(post.excerpt && post.excerpt.rendered);

  return {
    title: htmlToText(titleHtml).replace(/\s+/g, " ").trim(),
    url: post.link || null,
    slug: post.slug || slug,
    date: post.date || null,
    modified: post.modified || null,
    author: {
      name: authorName,
      slug: authorSlug,
      profileUrl,
    },
    excerpt,
    contentHtml,
    contentText,
    image,
    categories,
    tags,
  };
}
