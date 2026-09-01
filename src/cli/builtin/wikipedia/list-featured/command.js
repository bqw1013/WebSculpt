import { createConnection } from "node:net";
import { TLSSocket } from "node:tls";

const USER_AGENT = "WebSculpt-wikipedia-list-featured/1.0 (research automation; node runtime)";

// Language → featured-content category mapping.
// A missing kind for a language means that kind is not supported for that edition.
const CATEGORY_MAP = {
  zh: {
    articles: "典范条目",
    lists: "特色列表",
    images: "特色图片",
  },
  en: {
    articles: "Featured articles",
    lists: "Featured lists",
    images: "Featured pictures",
  },
  ja: {
    articles: "秀逸な記事",
    lists: "秀逸な一覧",
    images: "秀逸な画像",
  },
  ko: {
    articles: "알찬 글",
    lists: "알찬 목록",
  },
  fr: {
    articles: "Article de qualité",
  },
  de: {
    articles: "Wikipedia:Exzellent",
    images: "Datei:Exzellent",
  },
  es: {
    articles: "Wikipedia:Artículos destacados",
  },
  ru: {
    articles: "Википедия:Избранные статьи по алфавиту",
    lists: "Википедия:Избранные списки по алфавиту",
  },
  pt: {
    articles: "!Artigos destacados",
    lists: "!Listas destacadas",
    images: "!Imagens em destaque",
  },
  it: {
    articles: "Voci in vetrina",
  },
};

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function parseKind(kind) {
  const value = (kind || "articles").trim().toLowerCase();
  const allowed = ["articles", "lists", "images"];
  if (!allowed.includes(value)) {
    throw makeError("INVALID_PARAM", `kind must be one of ${allowed.join(", ")}`);
  }
  return value;
}

function parseLimit(limit) {
  const raw = limit === undefined || limit === null || limit === "" ? "20" : String(limit);
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw makeError("INVALID_PARAM", "limit must be a positive integer");
  }
  return parsed;
}

function parseLanguage(language) {
  const value = (language || "zh").trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]+)?$/i.test(value)) {
    throw makeError("INVALID_PARAM", "language must be a valid MediaWiki language code");
  }
  return value;
}

function resolveCategory(language, kind) {
  const byLang = CATEGORY_MAP[language];
  if (!byLang) {
    throw makeError("EMPTY_RESULT", `Featured content is not mapped for language "${language}"`);
  }
  const categoryName = byLang[kind];
  if (!categoryName) {
    throw makeError("EMPTY_RESULT", `Featured ${kind} is not mapped for language "${language}"`);
  }
  return categoryName;
}

function expectedNamespace(kind) {
  if (kind === "images") return 6;
  return 0;
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
      reject(makeError("NETWORK_ERROR", "Malformed proxy URL"));
      return;
    }

    if (proxy.protocol !== "http:" && proxy.protocol !== "https:") {
      reject(makeError("NETWORK_ERROR", `Unsupported proxy protocol: ${proxy.protocol}`));
      return;
    }

    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      reject(makeError("NETWORK_ERROR", "Malformed target URL"));
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
        reject(makeError("NETWORK_ERROR", `Proxy tunnel failed: ${statusLine}`));
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
        reject(makeError("NETWORK_ERROR", `TLS socket error: ${err.message}`));
      });
    });

    socket.on("error", (err) => {
      reject(makeError("NETWORK_ERROR", `Proxy socket error: ${err.message}`));
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
      throw makeError("NETWORK_ERROR", `Failed to reach Wikipedia via proxy: ${proxyError.message}`);
    }
  } else {
    let response;
    try {
      response = await fetch(url, { headers });
    } catch (networkError) {
      throw makeError("NETWORK_ERROR", `Failed to reach Wikipedia: ${networkError.message}`);
    }
    statusCode = response.status;
    try {
      bodyText = await response.text();
    } catch (textError) {
      throw makeError("NETWORK_ERROR", `Failed to read response: ${textError.message}`);
    }
  }

  if (statusCode === 429) {
    throw makeError("RATE_LIMITED", "Wikipedia rate limit encountered");
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw makeError("NETWORK_ERROR", `Wikipedia returned HTTP ${statusCode}`);
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (parseError) {
    throw makeError("NETWORK_ERROR", `Invalid JSON response: ${parseError.message}`);
  }

  return data;
}

function buildMemberUrl(language, title) {
  const encoded = encodeURIComponent(title)
    .replace(/%20/g, "_")
    .replace(/%3A/gi, ":")
    .replace(/%2F/gi, "/");
  return `https://${language}.wikipedia.org/wiki/${encoded}`;
}

export default async function (params) {
  const language = parseLanguage(params.language);
  const kind = parseKind(params.kind);
  const limit = parseLimit(params.limit);
  const categoryName = resolveCategory(language, kind);
  const expectedNs = expectedNamespace(kind);

  const apiType = kind === "images" ? "file" : "page";
  const pageSize = Math.min(limit, 500);

  const baseParams = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    format: "json",
    cmtitle: `Category:${categoryName}`,
    cmtype: apiType,
    cmprop: "ids|title|type",
    cmlimit: String(pageSize),
  });

  const items = [];
  let continueToken = null;
  let hasMore = false;

  while (items.length < limit) {
    if (continueToken) {
      await politeSleep();
    }

    const searchParams = new URLSearchParams(baseParams);
    if (continueToken) {
      searchParams.set("cmcontinue", continueToken);
    }

    const url = buildUrl(language, searchParams);
    const data = await fetchPage(url);

    if (data.error) {
      const code = data.error && data.error.code;
      if (code === "missingparam" || code === "badvalue") {
        throw makeError("INVALID_PARAM", `Wikipedia API rejected the request: ${code}`);
      }
      throw makeError("NETWORK_ERROR", `Wikipedia API error: ${code || "unknown"}`);
    }

    if (!data.query || !Array.isArray(data.query.categorymembers)) {
      throw makeError("DRIFT_DETECTED", "Unexpected API response structure");
    }

    const members = data.query.categorymembers;
    for (const member of members) {
      if (items.length >= limit) break;
      if (member.ns !== expectedNs) continue;

      const item = {
        pageid: member.pageid,
        ns: member.ns,
        type: member.type,
        title: member.title,
        url: buildMemberUrl(language, member.title),
      };
      items.push(item);
    }

    if (!data.continue || !data.continue.cmcontinue) {
      hasMore = false;
      break;
    }

    continueToken = data.continue.cmcontinue;

    // If the last page returned zero new items, stop to avoid an infinite loop.
    if (members.length === 0) {
      hasMore = false;
      break;
    }

    // More results exist; mark has_more unless we already reached the limit next iteration.
    hasMore = true;
  }

  if (items.length === 0) {
    throw makeError("EMPTY_RESULT", `No featured ${kind} found for language "${language}"`);
  }

  return {
    kind,
    language,
    category: categoryName,
    limit,
    count: items.length,
    has_more: hasMore && items.length >= limit,
    items,
  };
}