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

// Custom HTTPS agent that opens an HTTP CONNECT tunnel through the configured
// egress path and then performs TLS on the tunnelled socket. Lets Node's built-in
// HTTPS parser handle chunked transfer and content-length responses.
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

function parseLimit(value) {
  if (value === undefined || value === null || value === "") return 10;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 50) {
    throwError("INVALID_PARAM", "limit must be an integer between 1 and 50");
  }
  return num;
}

function parseOffset(value) {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    throwError("INVALID_PARAM", "offset must be a non-negative integer");
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

export default async function (params) {
  const query = (params.query || "").trim();
  if (!query) {
    throwError("INVALID_PARAM", "query is required and cannot be empty");
  }

  const limit = parseLimit(params.limit);
  const offset = parseOffset(params.offset);
  const language = parseLanguage(params.language);

  await politeSleep();

  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("sroffset", String(offset));
  url.searchParams.set("format", "json");
  url.searchParams.set("utf8", "1");

  const data = await fetchPage(url.toString());

  if (data && data.error) {
    const code = data.error.code;
    if (code === "missingparam") {
      throwError("INVALID_PARAM", data.error.info || "Missing required parameter");
    }
    throwError("NETWORK_ERROR", `API error ${code}: ${data.error.info || ""}`);
  }

  const searchInfo = data?.query?.searchinfo || {};
  const totalHits = searchInfo.totalhits ?? 0;
  const rawItems = data?.query?.search || [];

  if (totalHits === 0 && rawItems.length === 0) {
    throwError("EMPTY_RESULT", `No Wikipedia articles found for query "${query}"`);
  }

  const items = rawItems.map((item) => ({
    title: item.title,
    pageid: item.pageid,
    url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
    snippet: item.snippet,
    timestamp: item.timestamp,
    size: item.size,
    wordcount: item.wordcount,
  }));

  return omitNullish({
    query,
    language,
    count: items.length,
    total: totalHits,
    offset,
    items,
  });
}