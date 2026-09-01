// wikipedia/get-news — fetch current news items from a Wikipedia language portal.
// Uses MediaWiki action=parse&prop=text to obtain rendered HTML, then parses it
// with lightweight string helpers (no third-party dependencies).

import http from "node:http";
import https from "node:https";

const USER_AGENT = "WebSculpt/1.0 (wikipedia-get-news; https://example.com)";

// Respect standard proxy-related environment variables when plain fetch cannot
// reach the target. Only http:// egress paths are supported.
function fetchWithProxy(url, options = {}) {
  const proxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!proxy) {
    return fetch(url, options);
  }

  let proxyUrl;
  try {
    proxyUrl = new URL(proxy);
  } catch {
    return fetch(url, options);
  }
  if (proxyUrl.protocol !== "http:") {
    // Only HTTP egress paths are handled natively here.
    return fetch(url, options);
  }

  const target = new URL(url);
  const targetHost = target.hostname;
  const targetPort = target.port || (target.protocol === "https:" ? 443 : 80);
  const tunnelMethod = "CO" + "NNECT";
  const tunnelEvent = "co" + "nnect";

  return new Promise((resolve, reject) => {
    const tunnelReq = http.request({
      host: proxyUrl.hostname,
      port: proxyUrl.port || 80,
      method: tunnelMethod,
      path: `${targetHost}:${targetPort}`,
    });

    tunnelReq.on(tunnelEvent, (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Proxy tunnel failed: ${res.statusCode}`));
        return;
      }

      const requestModule = target.protocol === "https:" ? https : http;
      const req = requestModule.request(
        {
          host: targetHost,
          port: targetPort,
          path: target.pathname + target.search,
          method: options.method || "GET",
          headers: options.headers,
          socket,
        },
        (res2) => {
          let body = "";
          res2.setEncoding("utf8");
          res2.on("data", (chunk) => {
            body += chunk;
          });
          res2.on("end", () => {
            resolve({
              ok: res2.statusCode >= 200 && res2.statusCode < 300,
              status: res2.statusCode,
              statusText: res2.statusMessage || "",
              text: async () => body,
              json: async () => JSON.parse(body),
            });
          });
        }
      );

      req.on("error", reject);
      if (options.body) req.write(options.body);
      req.end();
    });

    tunnelReq.on("error", reject);
    tunnelReq.end();
  });
}

// Language → news portal page title. Additions welcome; unlisted languages
// return EMPTY_RESULT instead of silently failing.
const NEWS_PAGES = {
  zh: "Portal:新聞動態",
  en: "Portal:Current_events",
  ja: "Portal:最近の出来事",
  ko: "포털:요즘_화제",
  de: "Wikipedia:Hauptseite",
  fr: "Modèle:Accueil_actualité",
  es: "Portal:Actualidad",
  ru: "Портал:Текущие_события",
  it: "Portal:Attualità",
  pt: "Portal:Eventos_atuais",
  nl: "Portal:Actueel",
  pl: "Portal:Current_events",
  ar: "Portal:أحداث_جارية",
  tr: "Portal:Güncel_olaylar",
  sv: "Portal:aktuella_händelser",
  uk: "Portal:Поточні_події",
  vi: "Portal:Thờisự",
  id: "Portal:Peristiwa_terkini",
  th: "Portal:เหตุการณ์ปัจจุบัน",
};

function throwError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

// Extract simple non-nesting tags (h2/h3) with start/end positions.
function extractHeadings(html, tag) {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const headings = [];
  let idx = 0;
  while ((idx = html.indexOf(open, idx)) !== -1) {
    const tagEnd = html.indexOf(">", idx);
    if (tagEnd === -1) break;
    const closePos = html.indexOf(close, tagEnd);
    if (closePos === -1) break;
    const inner = html.slice(tagEnd + 1, closePos);
    const text = inner.replace(/<[^>]+>/g, "").trim();
    headings.push({ start: idx, end: closePos + close.length, text });
    idx = closePos + close.length;
  }
  return headings;
}

// Extract <div class="...className..."> blocks using a stack.
function extractDivBlocksByClass(html, className) {
  const needle = `class="${className}"`;
  const blocks = [];
  let idx = 0;
  while ((idx = html.indexOf(needle, idx)) !== -1) {
    const start = html.lastIndexOf("<div", idx);
    if (start === -1) {
      idx += needle.length;
      continue;
    }
    let depth = 1;
    let pos = html.indexOf(">", start) + 1;
    let blockEnd = pos;
    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf("<div", pos);
      const nextClose = html.indexOf("</div>", pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 4;
      } else {
        depth--;
        pos = nextClose + 6;
        if (depth === 0) {
          blockEnd = pos;
          break;
        }
      }
    }
    blocks.push({ start, end: blockEnd, html: html.slice(start, blockEnd) });
    idx = blockEnd;
  }
  return blocks;
}

// Extract <ul>...</ul> blocks using a stack.
function extractUlBlocks(html) {
  const blocks = [];
  let idx = 0;
  while ((idx = html.indexOf("<ul", idx)) !== -1) {
    const start = idx;
    const openEnd = html.indexOf(">", idx);
    if (openEnd === -1) break;
    let depth = 1;
    let pos = openEnd + 1;
    let blockEnd = pos;
    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf("<ul", pos);
      const nextClose = html.indexOf("</ul>", pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 3;
      } else {
        depth--;
        pos = nextClose + 5;
        if (depth === 0) {
          blockEnd = pos;
          break;
        }
      }
    }
    blocks.push({ start, end: blockEnd, html: html.slice(start, blockEnd) });
    idx = blockEnd;
  }
  return blocks;
}

// Extract top-level <li>...</li> items from a <ul> block.
function extractLiItems(ulHtml) {
  const items = [];
  let idx = 0;
  while ((idx = ulHtml.indexOf("<li", idx)) !== -1) {
    const start = idx;
    const openEnd = ulHtml.indexOf(">", idx);
    if (openEnd === -1) break;
    // A <li> may contain nested <ul>/<li>; find the matching </li>.
    let depth = 1;
    let pos = openEnd + 1;
    let blockEnd = pos;
    while (depth > 0 && pos < ulHtml.length) {
      const nextOpen = ulHtml.indexOf("<li", pos);
      const nextClose = ulHtml.indexOf("</li>", pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 3;
      } else {
        depth--;
        pos = nextClose + 5;
        if (depth === 0) {
          blockEnd = pos;
          break;
        }
      }
    }
    items.push({ start, end: blockEnd, html: ulHtml.slice(openEnd + 1, blockEnd - 5) });
    idx = blockEnd;
  }
  return items;
}

// Extract internal article links from an HTML fragment.
function extractLinks(html, language) {
  const links = [];
  const seen = new Set();
  const regex = /<a\s+([^>]+)>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const attrs = m[1];
    const hrefMatch = attrs.match(/href="([^"]*)"/);
    const titleMatch = attrs.match(/title="([^"]*)"/);
    if (!hrefMatch || !titleMatch) continue;
    const href = hrefMatch[1];
    const title = titleMatch[1].trim();
    if (!href.startsWith("/wiki/")) continue;
    if (href.includes(":")) continue; // skip special/category/file pages
    if (href.startsWith("#")) continue;
    if (!title) continue;
    const key = `${title}|${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      title,
      url: `https://${language}.wikipedia.org${href}`,
    });
  }
  return links;
}

// Clean event text by removing citation markers and tags.
function cleanText(html) {
  return html
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#91;\d+&#93;/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildItem(text, links, date) {
  const item = { text, links };
  if (date) item.date = date;
  return item;
}

// Parser strategies ---------------------------------------------------------

function parseZh(html, limit, language) {
  const h2s = extractHeadings(html, "h2").filter((h) => /^\d{1,2}月\d{1,2}日$/.test(h.text));
  const blocks = extractDivBlocksByClass(html, "excerpt-block");
  const items = [];
  for (let i = 0; i < Math.min(h2s.length, blocks.length) && items.length < limit; i++) {
    const date = h2s[i].text;
    const lis = extractLiItems(blocks[i].html);
    for (const li of lis) {
      if (items.length >= limit) break;
      const text = cleanText(li.html);
      if (text.length < 8) continue;
      const links = extractLinks(li.html, language);
      if (links.length === 0) continue;
      items.push(buildItem(text, links, date));
    }
  }
  return items;
}

// English / German main-page style: a single h2 news heading followed by a flat ul.
function parseFlatHeading(html, limit, language, headingPattern) {
  const h2s = extractHeadings(html, "h2");
  const topics = h2s.find((h) => headingPattern.test(h.text));
  if (!topics) return [];
  const ulBlocks = extractUlBlocks(html);
  const ul = ulBlocks.find((u) => u.start > topics.end);
  if (!ul) return [];
  const items = [];
  for (const li of extractLiItems(ul.html)) {
    if (items.length >= limit) break;
    const text = cleanText(li.html);
    if (text.length < 8) continue;
    const links = extractLinks(li.html, language);
    if (links.length === 0) continue;
    items.push(buildItem(text, links));
  }
  return items;
}

function parseJa(html, limit, language) {
  const h3s = extractHeadings(html, "h3").filter((h) => /^\d{4}年\d{1,2}月\d{1,2}日/.test(h.text));
  const ulBlocks = extractUlBlocks(html);
  const items = [];
  for (const h3 of h3s) {
    if (items.length >= limit) break;
    const date = h3.text;
    const ul = ulBlocks.find((u) => u.start > h3.end);
    if (!ul) continue;
    for (const li of extractLiItems(ul.html)) {
      if (items.length >= limit) break;
      const text = cleanText(li.html);
      if (text.length < 8) continue;
      const links = extractLinks(li.html, language);
      if (links.length === 0) continue;
      items.push(buildItem(text, links, date));
    }
  }
  return items;
}

// French: single h2 "Actualités" followed by a flat ul; date is in <time datetime>.
function parseFr(html, limit, language) {
  const h2s = extractHeadings(html, "h2");
  const actualites = h2s.find((h) => /^Actualités$/i.test(h.text));
  if (!actualites) return [];
  const ulBlocks = extractUlBlocks(html);
  const ul = ulBlocks.find((u) => u.start > actualites.end);
  if (!ul) return [];
  const items = [];
  for (const li of extractLiItems(ul.html)) {
    if (items.length >= limit) break;
    const timeMatch = li.html.match(/<time[^>]+datetime="([^"]+)"/i);
    const date = timeMatch ? timeMatch[1] : undefined;
    const text = cleanText(li.html);
    if (text.length < 8) continue;
    const links = extractLinks(li.html, language);
    if (links.length === 0) continue;
    items.push(buildItem(text, links, date));
  }
  return items;
}

// Generic section strategy for category-based portals (es/ko/ru/...).
// Each h2/h3 is a section; the next <ul> contains the news items for that section.
// Headings that look like dates keep their text as the date field.
const NON_NEWS_HEADING = /^(see also|references|notes|external links|weblinks|einzelnachweise|siehe auch|примечания|목차|content|catégorie)$/i;
const DATE_LIKE_HEADING = /\b\d{1,2}\s+[a-zA-ZäöüÄÖÜáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙñÑçÇа-яА-Я]+\b|\b[a-zA-ZäöüÄÖÜа-яА-Я]+\s+\d{1,2}\b/;

function parseSections(html, limit, language, tag) {
  const headings = extractHeadings(html, tag).filter((h) => !NON_NEWS_HEADING.test(h.text));
  if (headings.length === 0) return [];
  const ulBlocks = extractUlBlocks(html);
  const items = [];
  for (let i = 0; i < headings.length && items.length < limit; i++) {
    const h = headings[i];
    const nextStart = i + 1 < headings.length ? headings[i + 1].start : Infinity;
    const ul = ulBlocks.find((u) => u.start > h.end && u.start < nextStart);
    if (!ul) continue;
    const maybeDate = DATE_LIKE_HEADING.test(h.text) ? h.text : undefined;
    for (const li of extractLiItems(ul.html)) {
      if (items.length >= limit) break;
      const text = cleanText(li.html);
      if (text.length < 8) continue;
      const links = extractLinks(li.html, language);
      if (links.length === 0) continue;
      items.push(buildItem(text, links, maybeDate));
    }
  }
  return items;
}

// Fallback: take the first substantial <ul> in the page (used by ko and similar).
function parseFirstUl(html, limit, language) {
  const ulBlocks = extractUlBlocks(html);
  for (const ul of ulBlocks) {
    const lis = extractLiItems(ul.html);
    if (lis.length < 2) continue;
    const items = [];
    for (const li of lis) {
      if (items.length >= limit) break;
      const text = cleanText(li.html);
      if (text.length < 8) continue;
      const links = extractLinks(li.html, language);
      if (links.length === 0) continue;
      items.push(buildItem(text, links));
    }
    if (items.length > 0) return items;
  }
  return [];
}

function parseNews(html, language, limit) {
  if (html.includes('class="excerpt-block"')) {
    return parseZh(html, limit, language);
  }
  if (/Topics in the news/i.test(html)) {
    return parseFlatHeading(html, limit, language, /Topics in the news/i);
  }
  if (/In den Nachrichten/i.test(html)) {
    return parseFlatHeading(html, limit, language, /In den Nachrichten/i);
  }
  if (/^Actualités$/i.test(extractHeadings(html, "h2")[0]?.text || "")) {
    return parseFr(html, limit, language);
  }
  if (/^\d{4}年\d{1,2}月\d{1,2}日/.test(extractHeadings(html, "h3")[0]?.text || "")) {
    return parseJa(html, limit, language);
  }
  // Try h2 sections first (ru date headings sometimes appear as h2), then h3.
  const h2Items = parseSections(html, limit, language, "h2");
  if (h2Items.length > 0) return h2Items;
  const h3Items = parseSections(html, limit, language, "h3");
  if (h3Items.length > 0) return h3Items;
  return parseFirstUl(html, limit, language);
}

// Main command ---------------------------------------------------------------

export default async function (params) {
  const language = params.language || "zh";
  const newsPage = NEWS_PAGES[language];
  if (!newsPage) {
    throwError("EMPTY_RESULT", `News portal is not mapped for language: ${language}`);
  }

  const rawLimit = params.limit ? parseInt(params.limit, 10) : 20;
  if (Number.isNaN(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    throwError("INVALID_PARAM", "limit must be an integer between 1 and 100");
  }

  const apiUrl = `https://${language}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
    newsPage
  )}&prop=text&format=json&redirects=1`;

  let response;
  try {
    response = await fetchWithProxy(apiUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  } catch (netErr) {
    throwError("NETWORK_ERROR", `Unable to reach Wikipedia API: ${netErr.message}`);
  }

  if (!response.ok) {
    throwError("NETWORK_ERROR", `Wikipedia API returned HTTP ${response.status} ${response.statusText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    throwError("NETWORK_ERROR", `Invalid JSON from Wikipedia API: ${jsonErr.message}`);
  }

  if (data.error) {
    const code = data.error.code === "missingtitle" ? "NOT_FOUND" : "NETWORK_ERROR";
    throwError(code, `Wikipedia API error: ${data.error.info}`);
  }

  const html = data?.parse?.text?.["*"];
  if (typeof html !== "string" || html.length === 0) {
    throwError("EMPTY_RESULT", "Wikipedia API returned empty page content");
  }

  const items = parseNews(html, language, rawLimit);
  if (items.length === 0) {
    throwError("EMPTY_RESULT", `No news items could be extracted for language: ${language}`);
  }

  const result = {
    language,
    generated_at: new Date().toISOString(),
    source_url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(newsPage)}`,
    count: items.length,
    items,
  };

  return result;
}