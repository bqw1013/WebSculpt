import { createConnection } from "node:net";
import { TLSSocket } from "node:tls";
import https from "node:https";
import { URL } from "node:url";

const UA = "OpenOctopus-WebSculpt/1.0 (research; contact@example.com)";

function throwError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
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

function getProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null
  );
}

class ProxyAgent extends https.Agent {
  constructor(proxyUrl, opts = {}) {
    super(opts);
    this.proxy = new URL(proxyUrl);
  }

  createConnection(options, callback) {
    const targetHost = options.host;
    const targetPort = options.port || 443;
    const proxyHost = this.proxy.hostname;
    const proxyPort = parseInt(this.proxy.port, 10) || 80;

    const socket = createConnection(proxyPort, proxyHost, () => {
      const tunnelReq = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`;
      socket.write(tunnelReq);
    });

    let buffer = "";
    let tunnelReady = false;

    const onData = (chunk) => {
      if (tunnelReady) return;
      buffer += chunk.toString("utf8");
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const statusLine = buffer.slice(0, buffer.indexOf("\r\n"));
      if (!statusLine.includes(" 200 ")) {
        socket.destroy();
        callback(new Error(`Proxy tunnel failed: ${statusLine}`));
        return;
      }

      tunnelReady = true;
      socket.removeListener("data", onData);

      const tlsSocket = new TLSSocket(socket, {
        servername: options.servername || targetHost,
        ALPNProtocols: ["http/1.1"],
      });
      tlsSocket.on("error", callback);
      callback(null, tlsSocket);
    };

    socket.on("data", onData);
    socket.on("error", callback);
  }
}

async function fetchPage(url) {
  const headers = {
    "User-Agent": UA,
    Accept: "application/json",
  };

  const proxyUrl = getProxyUrl();
  let response;

  try {
    if (proxyUrl) {
      response = await new Promise((resolve, reject) => {
        const req = https.get(
          url,
          { agent: new ProxyAgent(proxyUrl, { keepAlive: false }), headers, timeout: 15000 },
          (res) => {
            let raw = "";
            res.on("data", (chunk) => {
              raw += chunk;
            });
            res.on("end", () => {
              resolve({ status: res.statusCode, body: raw });
            });
          }
        );
        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error("Request timed out"));
        });
      });
    } else {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      response = { status: res.status, body: await res.text() };
    }
  } catch (cause) {
    throwError("NETWORK_ERROR", `Failed to reach Wikipedia: ${cause.message}`);
  }

  if (response.status === 429) {
    throwError("RATE_LIMITED", "Wikipedia rate limit encountered");
  }
  if (response.status < 200 || response.status >= 300) {
    throwError("NETWORK_ERROR", `Wikipedia returned HTTP ${response.status}`);
  }

  let data;
  try {
    data = JSON.parse(response.body);
  } catch (parseError) {
    throwError("NETWORK_ERROR", `Invalid JSON response: ${parseError.message}`);
  }
  return data;
}

function parseTitle(input, language) {
  if (!input || typeof input !== "string") {
    throwError("INVALID_PARAM", "title is required");
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throwError("INVALID_PARAM", "title cannot be empty");
  }

  let title = trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      throwError("INVALID_PARAM", "title URL is malformed");
    }
    const path = decodeURIComponent(url.pathname);
    const prefix = "/wiki/";
    if (!path.startsWith(prefix)) {
      throwError("INVALID_PARAM", "title URL must point to a Wikipedia article");
    }
    title = path.slice(prefix.length);
  }

  if (!title) {
    throwError("INVALID_PARAM", "title cannot be empty");
  }

  // Normalize spaces/underscores for API
  return title.replace(/ /g, "_");
}

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 20;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 500) {
    throwError("INVALID_PARAM", "limit must be an integer between 1 and 500");
  }
  return num;
}

function parseLanguage(value) {
  const lang = (value || "zh").trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]+)?$/.test(lang)) {
    throwError("INVALID_PARAM", "language must be a valid MediaWiki language code");
  }
  return lang;
}

function buildRevisionUrl(language, title, revid) {
  const encoded = encodeURIComponent(title)
    .replace(/%20/g, "_")
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/");
  return `https://${language}.wikipedia.org/w/index.php?title=${encoded}&oldid=${revid}`;
}

export default async function (params) {
  const language = parseLanguage(params.language);
  const title = parseTitle(params.title, language);
  const limit = parseLimit(params.limit);

  await politeSleep();

  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set(
    "rvprop",
    "ids|timestamp|user|comment|size|tags|parsedcomment"
  );
  url.searchParams.set("titles", title);
  url.searchParams.set("rvlimit", String(limit));
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  const data = await fetchPage(url.toString());

  if (data && data.error) {
    const code = data.error.code;
    if (code === "missingparam") {
      throwError("INVALID_PARAM", data.error.info || "Missing required parameter");
    }
    throwError("NETWORK_ERROR", `API error ${code}: ${data.error.info || ""}`);
  }

  const pages = data?.query?.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    throwError("INVALID_PARAM", "No article title provided");
  }

  const page = pages[0];

  if (page.missing) {
    throwError("NOT_FOUND", `Wikipedia article "${title.replace(/_/g, " ")}" not found`);
  }

  const rawRevisions = page.revisions || [];
  const pageTitle = page.title || title.replace(/_/g, " ");
  const pageid = page.pageid;

  const revisions = rawRevisions.map((rev) => {
    const item = {
      revid: rev.revid,
      parentid: rev.parentid,
      timestamp: rev.timestamp,
      user: rev.user,
      comment: rev.comment,
      parsedcomment: rev.parsedcomment,
      size: rev.size,
      tags: rev.tags,
      url: rev.revid ? buildRevisionUrl(language, title, rev.revid) : undefined,
    };
    return omitNullish(item);
  });

  if (revisions.length === 0) {
    throwError("EMPTY_RESULT", `No revisions found for "${pageTitle}"`);
  }

  return omitNullish({
    title: pageTitle,
    language,
    pageid,
    count: revisions.length,
    revisions,
  });
}