import { execFile } from "node:child_process";

const USER_AGENT = "OpenOctopus-WebSculpt-wikipedia-list-related/1.0 (research automation; node runtime)";
const MAX_LIMIT = 500;

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function omitNullish(obj) {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) {
    return obj.map(omitNullish).filter((v) => v !== undefined);
  }
  if (typeof obj === "object") {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleaned = omitNullish(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return result;
  }
  return obj;
}

function politeSleep() {
  const ms = 200 + Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseLanguage(value) {
  const lang = (value || "zh").trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]+)?$/.test(lang)) {
    throw makeError("INVALID_PARAM", "language must be a valid MediaWiki language code");
  }
  return lang;
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 20;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > MAX_LIMIT) {
    throw makeError("INVALID_PARAM", `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return num;
}

function parseTitle(raw) {
  if (!raw || !raw.trim()) {
    throw makeError("INVALID_PARAM", "title is required and cannot be empty");
  }

  let title = raw.trim();
  let language = null;

  if (/^https?:\/\//i.test(title)) {
    try {
      const url = new URL(title);
      const hostMatch = url.hostname.match(/^([a-z]{2,3}(?:-[a-z0-9]+)?)\.wikipedia\.org$/i);
      if (hostMatch) {
        language = hostMatch[1].toLowerCase();
      }
      const parts = url.pathname.split("/").filter(Boolean);
      const last = parts.pop();
      if (!last) {
        throw makeError("INVALID_PARAM", "Invalid title URL provided");
      }
      title = decodeURIComponent(last);
    } catch (err) {
      if (err.code === "INVALID_PARAM") throw err;
      throw makeError("INVALID_PARAM", "Invalid title URL provided");
    }
  }

  title = title.replace(/_/g, " ").trim();
  if (!title) {
    throw makeError("INVALID_PARAM", "Invalid or empty title");
  }

  return { title, language };
}

function buildWikiUrl(title, language) {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  return `https://${language}.wikipedia.org/wiki/${encoded}`;
}

async function httpFetch(url) {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-sS",
        "-L",
        "--max-time",
        "30",
        "-A",
        USER_AGENT,
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
          reject(makeError("NETWORK_ERROR", msg));
          return;
        }

        const lines = stdout.split("\n");
        const statusLine = lines.pop();
        const body = lines.join("\n");
        const status = Number.parseInt(statusLine, 10) || 0;
        resolve({ ok: status >= 200 && status < 300, status, body });
      }
    );
  });
}

async function fetchJson(url) {
  const maxRetries = 5;
  let attempts = 0;

  while (true) {
    let res;
    try {
      res = await httpFetch(url);
    } catch (err) {
      if (err.code) throw err;
      throw makeError("NETWORK_ERROR", `Failed to reach Wikipedia: ${err.message}`);
    }

    if (res.status === 429) {
      attempts += 1;
      if (attempts <= maxRetries) {
        // Exponential-ish backoff: 2s, 4s, 6s, 8s, 10s plus jitter.
        await sleep(attempts * 2000 + Math.floor(Math.random() * 1000));
        continue;
      }
      throw makeError("RATE_LIMITED", "Rate limited by Wikipedia");
    }

    if (!res.ok) {
      throw makeError("NETWORK_ERROR", `Wikipedia returned HTTP ${res.status}`);
    }

    let data;
    try {
      data = JSON.parse(res.body);
    } catch (parseError) {
      throw makeError("NETWORK_ERROR", `Invalid JSON response: ${parseError.message}`);
    }

    return data;
  }
}

export default async function (params) {
  const parsedTitle = parseTitle(params.title);
  const language = parsedTitle.language || parseLanguage(params.language);
  const limit = parseLimit(params.limit);

  await politeSleep();

  const encodedTitle = encodeURIComponent(parsedTitle.title.replace(/ /g, "_"));
  const apiUrl = `https://${language}.wikipedia.org/w/api.php?action=query&prop=links&titles=${encodedTitle}&pllimit=${limit}&plnamespace=0&format=json&formatversion=2&utf8=1`;

  const data = await fetchJson(apiUrl);

  if (data && data.error) {
    const code = data.error.code;
    if (code === "missingparam" || code === "invalidparam" || code === "badparams") {
      throw makeError("INVALID_PARAM", data.error.info || "Invalid API parameter");
    }
    throw makeError("NETWORK_ERROR", `API error ${code}: ${data.error.info || ""}`);
  }

  const pages = data?.query?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw makeError("NETWORK_ERROR", "Unexpected API response: no pages returned");
  }

  const page = pages[0];
  if (page.missing) {
    throw makeError("NOT_FOUND", `Article not found: ${parsedTitle.title}`);
  }

  const rawLinks = page.links || [];
  const baseWikiUrl = `https://${language}.wikipedia.org/wiki/`;
  const links = rawLinks.map((link) =>
    omitNullish({
      title: link.title,
      ns: link.ns,
      url: `${baseWikiUrl}${encodeURIComponent(link.title.replace(/ /g, "_"))}`,
    })
  );

  return omitNullish({
    title: page.title,
    pageid: page.pageid,
    language,
    count: links.length,
    links,
  });
}