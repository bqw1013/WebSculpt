import { createConnection } from "node:net";
import { TLSSocket } from "node:tls";

const USER_AGENT = "WebSculpt/1.0 (contact: local-dev; bot/0.1)";

function parseUser(input) {
  if (!input || typeof input !== "string") {
    const err = new Error("[INVALID_PARAM] user is required");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    const err = new Error("[INVALID_PARAM] user is required");
    err.code = "INVALID_PARAM";
    throw err;
  }

  let userName = trimmed;

  // Accept full user page URLs like https://{lang}.wikipedia.org/wiki/User:{name}
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      const err = new Error("[INVALID_PARAM] user URL is malformed");
      err.code = "INVALID_PARAM";
      throw err;
    }

    const path = decodeURIComponent(url.pathname);
    const prefix = "/wiki/User:";
    if (!path.startsWith(prefix)) {
      const err = new Error("[INVALID_PARAM] user URL must point to a User page");
      err.code = "INVALID_PARAM";
      throw err;
    }
    userName = path.slice(prefix.length);
  }

  // Strip optional "User:" prefix if passed directly
  if (userName.startsWith("User:")) {
    userName = userName.slice("User:".length);
  }

  if (!userName) {
    const err = new Error("[INVALID_PARAM] user name cannot be empty");
    err.code = "INVALID_PARAM";
    throw err;
  }

  return userName;
}

function parseLimit(limit) {
  const raw = limit === undefined || limit === null || limit === "" ? "20" : String(limit);
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    const err = new Error("[INVALID_PARAM] limit must be a positive integer");
    err.code = "INVALID_PARAM";
    throw err;
  }
  return parsed;
}

function parseLanguage(language) {
  const value = (language || "zh").trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]+)?$/i.test(value)) {
    const err = new Error("[INVALID_PARAM] language must be a valid MediaWiki language code");
    err.code = "INVALID_PARAM";
    throw err;
  }
  return value;
}

function buildUrl(language, searchParams) {
  return `https://${language}.wikipedia.org/w/api.php?${searchParams.toString()}`;
}

function politeSleep() {
  const ms = 200 + Math.floor(Math.random() * 500); // 200-700ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    null
  );
}

function requestViaHttpProxy(targetUrl, proxyUrl, headers) {
  return new Promise((resolve, reject) => {
    let proxy;
    try {
      proxy = new URL(proxyUrl);
    } catch {
      reject(new Error("[NETWORK_ERROR] Malformed proxy URL"));
      return;
    }

    if (proxy.protocol !== "http:" && proxy.protocol !== "https:") {
      reject(new Error(`[NETWORK_ERROR] Unsupported proxy protocol: ${proxy.protocol}`));
      return;
    }

    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      reject(new Error("[NETWORK_ERROR] Malformed target URL"));
      return;
    }

    const proxyHost = proxy.hostname || "127.0.0.1";
    const proxyPort = parseInt(proxy.port || "80", 10);
    const targetHost = target.hostname;
    const targetPort = target.protocol === "https:" ? 443 : 80;

    const socket = createConnection(proxyPort, proxyHost, () => {
      const tunnelReq = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`;
      socket.write(tunnelReq);
    });

    let buffer = "";
    let tunnelReady = false;

    socket.on("data", (chunk) => {
      if (tunnelReady) return;
      buffer += chunk.toString("utf8");
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const statusLine = buffer.slice(0, buffer.indexOf("\r\n"));
      if (!statusLine.includes(" 200 ")) {
        socket.destroy();
        reject(new Error(`[NETWORK_ERROR] Proxy tunnel failed: ${statusLine}`));
        return;
      }

      tunnelReady = true;
      const tlsSocket = new TLSSocket(socket, { servername: targetHost, ALPNProtocols: ["http/1.1"] });

      const httpReq =
        `GET ${target.pathname}${target.search} HTTP/1.1\r\n` +
        `Host: ${targetHost}\r\n` +
        Object.entries(headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        `\r\n\r\n`;

      tlsSocket.write(httpReq);

      let responseBuffer = Buffer.alloc(0);
      let headersParsed = false;
      let contentLength = null;
      let chunked = false;
      let headerEndIndex = -1;
      let statusCode = null;

      tlsSocket.on("data", (data) => {
        responseBuffer = Buffer.concat([responseBuffer, data]);

        if (!headersParsed) {
          const headerString = responseBuffer.toString("utf8");
          headerEndIndex = headerString.indexOf("\r\n\r\n");
          if (headerEndIndex === -1) return;

          const headerLines = headerString.slice(0, headerEndIndex).split("\r\n");
          const statusLine = headerLines[0];
          const statusMatch = statusLine.match(/HTTP\/\d\.\d (\d+)/);
          statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;

          for (let i = 1; i < headerLines.length; i++) {
            const line = headerLines[i];
            const lower = line.toLowerCase();
            if (lower.startsWith("content-length:")) {
              contentLength = parseInt(line.slice(15).trim(), 10);
            } else if (lower.startsWith("transfer-encoding:") && line.toLowerCase().includes("chunked")) {
              chunked = true;
            }
          }
          headersParsed = true;
        }

        const bodyStart = headerEndIndex + 4;
        if (chunked) {
          const bodyString = responseBuffer.slice(bodyStart).toString("utf8");
          const chunks = [];
          let offset = 0;
          while (true) {
            const chunkEnd = bodyString.indexOf("\r\n", offset);
            if (chunkEnd === -1) break;
            const sizeHex = bodyString.slice(offset, chunkEnd).trim();
            const size = parseInt(sizeHex, 16);
            if (Number.isNaN(size)) break;
            if (size === 0) {
              resolve({ statusCode, body: chunks.join("") });
              tlsSocket.end();
              return;
            }
            const chunkStart = chunkEnd + 2;
            const chunkData = bodyString.slice(chunkStart, chunkStart + size);
            if (chunkData.length < size) break;
            chunks.push(chunkData);
            offset = chunkStart + size + 2;
          }
        } else if (contentLength !== null && responseBuffer.length >= bodyStart + contentLength) {
          const body = responseBuffer.slice(bodyStart, bodyStart + contentLength).toString("utf8");
          resolve({ statusCode, body });
          tlsSocket.end();
        } else if (contentLength === null && responseBuffer.length > bodyStart) {
          // No content-length and not chunked; wait for socket close
        }
      });

      tlsSocket.on("end", () => {
        if (!headersParsed) return;
        const bodyStart = headerEndIndex + 4;
        const body = responseBuffer.slice(bodyStart).toString("utf8");
        resolve({ statusCode, body });
      });

      tlsSocket.on("error", (err) => {
        reject(new Error(`[NETWORK_ERROR] TLS socket error: ${err.message}`));
      });
    });

    socket.on("error", (err) => {
      reject(new Error(`[NETWORK_ERROR] Proxy socket error: ${err.message}`));
    });
  });
}

async function fetchPage(url) {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };

  let statusCode;
  let bodyText;

  const proxyUrl = getProxyUrl();

  if (proxyUrl) {
    try {
      const result = await requestViaHttpProxy(url, proxyUrl, headers);
      statusCode = result.statusCode;
      bodyText = result.body;
    } catch (proxyError) {
      const err = new Error(`[NETWORK_ERROR] Failed to reach Wikipedia via proxy: ${proxyError.message}`);
      err.code = "NETWORK_ERROR";
      throw err;
    }
  } else {
    let response;
    try {
      response = await fetch(url, { headers });
    } catch (networkError) {
      const err = new Error(`[NETWORK_ERROR] Failed to reach Wikipedia: ${networkError.message}`);
      err.code = "NETWORK_ERROR";
      throw err;
    }
    statusCode = response.status;
    try {
      bodyText = await response.text();
    } catch (textError) {
      const err = new Error(`[NETWORK_ERROR] Failed to read response: ${textError.message}`);
      err.code = "NETWORK_ERROR";
      throw err;
    }
  }

  if (statusCode === 429) {
    const err = new Error("[RATE_LIMITED] Wikipedia rate limit encountered");
    err.code = "RATE_LIMITED";
    throw err;
  }

  if (statusCode < 200 || statusCode >= 300) {
    const err = new Error(`[NETWORK_ERROR] Wikipedia returned HTTP ${statusCode}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (parseError) {
    const err = new Error(`[NETWORK_ERROR] Invalid JSON response: ${parseError.message}`);
    err.code = "NETWORK_ERROR";
    throw err;
  }

  return data;
}

function buildTitleUrl(language, title) {
  const encoded = encodeURIComponent(title)
    .replace(/%20/g, "_")
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/");
  return `https://${language}.wikipedia.org/wiki/${encoded}`;
}

function clean(value) {
  return value === null || value === undefined ? undefined : value;
}

function mapContrib(language, item) {
  const mapped = {
    revid: clean(item.revid),
    parentid: clean(item.parentid),
    timestamp: clean(item.timestamp),
    title: clean(item.title),
    ns: clean(item.ns),
    comment: clean(item.comment),
    size: clean(item.size),
    sizediff: clean(item.sizediff),
    tags: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : undefined,
    url: item.title ? buildTitleUrl(language, item.title) : undefined,
  };

  // Omit null/undefined fields
  return Object.fromEntries(Object.entries(mapped).filter(([, v]) => v !== undefined));
}

export default async function (params) {
  const language = parseLanguage(params.language);
  const userName = parseUser(params.user);
  const limit = parseLimit(params.limit);

  const baseParams = new URLSearchParams({
    action: "query",
    list: "usercontribs",
    format: "json",
    ucuser: userName,
    ucdir: "older",
    ucprop: "ids|title|timestamp|comment|size|sizediff|tags",
    uclimit: String(Math.min(limit, 500)),
  });

  const contribs = [];
  let continueToken = null;

  while (contribs.length < limit) {
    if (continueToken) {
      await politeSleep();
    }

    const searchParams = new URLSearchParams(baseParams);
    if (continueToken) {
      searchParams.set("uccontinue", continueToken);
    }

    const url = buildUrl(language, searchParams);
    const data = await fetchPage(url);

    if (data.error) {
      const code = data.error && data.error.code;
      if (code === "missingparam") {
        const err = new Error("[INVALID_PARAM] Missing required API parameter");
        err.code = "INVALID_PARAM";
        throw err;
      }
      const err = new Error(`[NETWORK_ERROR] Wikipedia API error: ${code || "unknown"}`);
      err.code = "NETWORK_ERROR";
      throw err;
    }

    if (!data.query || !Array.isArray(data.query.usercontribs)) {
      const err = new Error("[DRIFT_DETECTED] Unexpected API response structure");
      err.code = "DRIFT_DETECTED";
      throw err;
    }

    for (const item of data.query.usercontribs) {
      if (contribs.length >= limit) break;
      contribs.push(mapContrib(language, item));
    }

    if (!data.continue || !data.continue.uccontinue) {
      break;
    }

    continueToken = data.continue.uccontinue;

    // Safety: if the last page returned zero new items, stop to avoid infinite loop
    if (data.query.usercontribs.length === 0) {
      break;
    }
  }

  if (contribs.length === 0) {
    const err = new Error(`[EMPTY_RESULT] No contributions found for user "${userName}"`);
    err.code = "EMPTY_RESULT";
    throw err;
  }

  return {
    user: userName,
    language,
    count: contribs.length,
    contribs,
  };
}