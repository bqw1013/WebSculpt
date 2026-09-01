// Wikipedia get-article: fetch structured article content via MediaWiki APIs.
// Runtime: node. No browser fallback.

import { execFile } from "node:child_process";

const USER_AGENT = "WebSculpt-wikipedia-get-article/1.0 (research automation; node runtime)";

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function normalizeTitle(raw) {
  if (!raw || !raw.trim()) {
    return null;
  }
  let title = raw.trim();
  if (/^https?:\/\//i.test(title)) {
    try {
      const url = new URL(title);
      // Path is /wiki/{title} or /{title} depending on site config.
      const parts = url.pathname.split("/").filter(Boolean);
      const last = parts.pop();
      if (!last) {
        return null;
      }
      title = decodeURIComponent(last);
    } catch {
      throw makeError("INVALID_PARAM", "Invalid title URL provided");
    }
  }
  title = title.replace(/_/g, " ");
  return title.trim();
}

function htmlDecode(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripTags(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ");
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function cleanText(html) {
  return collapseWhitespace(stripTags(htmlDecode(html)));
}

function extractInfoboxRows(html) {
  // Find the first table whose class attribute contains "infobox".
  const infoboxMatch = html.match(/<table\b[^>]*\bclass=["'][^"']*\binfobox\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!infoboxMatch) {
    return null;
  }
  const tableHtml = infoboxMatch[1];
  const rows = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const rowHtml = rowMatch[1];
    const cellRegex = /<t(?:h|d)\b[^>]*>([\s\S]*?)<\/t(?:h|d)>/gi;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1]);
    }
    if (cells.length >= 2) {
      const key = cleanText(cells[0]);
      const value = cleanText(cells[1]);
      if (key) {
        rows.push({ key, value });
      }
    } else if (cells.length === 1) {
      // Possible section header (th[colspan]). Skip headers in key-value output.
      const headerText = cleanText(cells[0]);
      if (headerText) {
        rows.push({ key: "__header__", value: headerText });
      }
    }
  }
  return rows.length > 0 ? rows : null;
}

async function httpFetch(url, options = {}) {
  // Use curl for network requests; it follows redirects and respects the
  // process environment for egress path settings.
  const ua = options.headers?.["User-Agent"] || USER_AGENT;
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-sS",
        "-L",
        "--max-time",
        String(options.timeout || 30),
        "-A",
        ua,
        "-w",
        "\n%{http_code}",
        url,
      ],
      { env: process.env, maxBuffer: 1024 * 1024 * 10 },
      (err, stdout) => {
        if (err) {
          const msg = err.message || "";
          if (msg.includes("28")) {
            reject(makeError("NETWORK_ERROR", "Request timeout"));
            return;
          }
          if (msg.includes("Could not resolve") || msg.includes("Connection refused")) {
            reject(makeError("NETWORK_ERROR", msg));
            return;
          }
          reject(new Error(msg));
          return;
        }
        const lines = stdout.split("\n");
        const statusLine = lines.pop();
        const body = lines.join("\n");
        const status = Number.parseInt(statusLine, 10) || 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      }
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  // 500–1500 ms random delay to be polite to the Wikimedia API.
  return 500 + Math.floor(Math.random() * 1000);
}

async function fetchJson(url, retry429 = true) {
  let attempts = 0;
  while (true) {
    const res = await httpFetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.ok) {
      return res.json();
    }
    if (res.status === 404) {
      throw makeError("NOT_FOUND", "Article not found");
    }
    if (res.status === 429) {
      attempts += 1;
      if (retry429 && attempts <= 5) {
        // Exponential-ish backoff: 2s, 4s, 6s, 8s, 10s plus jitter.
        await sleep(attempts * 2000 + Math.floor(Math.random() * 1000));
        continue;
      }
      throw makeError("RATE_LIMITED", "Rate limited by Wikipedia");
    }
    throw makeError("NETWORK_ERROR", `HTTP ${res.status} from ${url}`);
  }
}

function pickImage(restData, actionPage) {
  if (restData?.thumbnail?.source) {
    return restData.thumbnail.source;
  }
  if (actionPage?.thumbnail?.source) {
    return actionPage.thumbnail.source;
  }
  return undefined;
}

export default async function(params) {
  const language = params.language || "zh";
  const include = params.include || "summary";
  const rawTitle = params.title;

  if (!rawTitle) {
    throw makeError("INVALID_PARAM", "Missing required parameter: title");
  }

  const validIncludes = ["summary", "full", "infobox", "all"];
  if (!validIncludes.includes(include)) {
    throw makeError("INVALID_PARAM", `Invalid include value: ${include}`);
  }

  const title = normalizeTitle(rawTitle);
  if (!title) {
    throw makeError("INVALID_PARAM", "Invalid or empty title");
  }

  const baseUrl = `https://${language}.wikipedia.org`;
  const encodedTitle = encodeURIComponent(title);

  const needBody = include === "full" || include === "all";
  const needInfobox = include === "infobox" || include === "all";

  // REST summary for description, thumbnail, and extract.
  const restUrl = `${baseUrl}/api/rest_v1/page/summary/${encodedTitle}`;

  // Action API for structured data.
  const actionProps = [
    "extracts",
    "categories",
    "links",
    "langlinks",
    "info",
    "revisions",
    "pageimages",
  ].join("|");
  const extractIntro = needBody ? "" : "&exintro=1";
  const actionUrl = `${baseUrl}/w/api.php?action=query&prop=${actionProps}&explaintext=1${extractIntro}&cllimit=20&pllimit=20&lllimit=50&inprop=url|displaytitle&rvprop=ids|timestamp|user|comment&rvlimit=1&piprop=thumbnail|original&pithumbsize=640&titles=${encodedTitle}&format=json`;

  const [restData, actionData] = await Promise.all([
    fetchJson(restUrl).catch((err) => {
      // REST 404 may happen for some valid pages if the REST summary is missing;
      // treat as null so Action API can still provide data.
      if (err.code === "NOT_FOUND") return null;
      throw err;
    }),
    fetchJson(actionUrl),
  ]);

  const pages = actionData?.query?.pages;
  if (!pages) {
    throw makeError("EMPTY_RESULT", "No page data returned");
  }
  const page = Object.values(pages)[0];
  if (!page || "missing" in page) {
    throw makeError("NOT_FOUND", "Article not found");
  }

  // Infobox if needed.
  let infobox;
  if (needInfobox) {
    await sleep(randomDelay());
    const parseUrl = `${baseUrl}/w/api.php?action=parse&prop=text&page=${encodedTitle}&format=json`;
    const parseData = await fetchJson(parseUrl);
    if (parseData?.error?.code === "missingtitle") {
      // Already handled above by Action API, but keep safe.
      throw makeError("NOT_FOUND", "Article not found");
    }
    const html = parseData?.parse?.text?.["*"];
    if (html) {
      infobox = extractInfoboxRows(html);
    }
  }

  const summary = restData?.extract || (needBody ? page.extract?.split(/\n+/).filter(Boolean)[0] : page.extract) || "";
  const body = needBody ? page.extract : undefined;
  const categories = (page.categories || [])
    .map((c) => c.title.replace(/^Category:/, ""))
    .filter(Boolean);
  const related = (page.links || [])
    .filter((l) => l.ns === 0)
    .map((l) => l.title)
    .filter(Boolean);
  const langlinks = (page.langlinks || []).map((l) => ({
    lang: l.lang,
    title: l["*"],
  }));

  const lastRevision = page.revisions?.[0];

  const result = {
    title: page.title,
    pageid: page.pageid,
    language,
    url: page.fullurl || `${baseUrl}/wiki/${encodedTitle}`,
    summary,
    categories,
    related,
    langlinks,
  };

  if (restData?.description || page.description) {
    result.description = restData?.description || page.description;
  }
  if (body) {
    result.body = body;
  }
  if (infobox) {
    result.infobox = infobox;
  }
  const image = pickImage(restData, page);
  if (image) {
    result.image = image;
  }
  if (lastRevision) {
    result.last_edited = {
      user: lastRevision.user,
      timestamp: lastRevision.timestamp,
      revid: lastRevision.revid,
      comment: lastRevision.comment,
    };
  }

  return result;
}