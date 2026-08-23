// techmeme/get-story
// 获取单个 Techmeme 故事簇的完整详情（主报道 + 相关报道 + 社媒讨论 + 官号帖子）。
// 永久链接页 = 当日快照页 + 锚点定位该簇；页面无时间戳，date 从 URL 的 yymmdd 派生。
// 请求 pacing：每次请求前随机 sleep 200-700ms。

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// 常用 HTML 实体（含中文/特殊符号场景）
const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'",
  "&apos;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–",
  "&hellip;": "…", "&ldquo;": "“", "&rdquo;": "”",
  "&lsquo;": "‘", "&rsquo;": "’", "&rarr;": "→",
  "&bull;": "•", "&middot;": "·", "&copy;": "©",
  "&eacute;": "é", "&egrave;": "è", "&agrave;": "à"
};

function decodeEntities(str) {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,10});/g, (m) => (Object.prototype.hasOwnProperty.call(ENTITIES, m) ? ENTITIES[m] : m));
}

// 解码实体 + 去标签 + 折叠空白 + 去首尾空白
function cleanText(str) {
  return decodeEntities(String(str || ""))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 从 start 处（必须指向 <DIV...> 起始）提取配平闭合的 div 区块
function extractBalancedDiv(html, start) {
  const re = /<DIV\b[^>]*>|<\/DIV>/gi;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0][1] === "/") depth--;
    else depth++;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return null;
}

function sleepRandom() {
  const ms = 200 + Math.floor(Math.random() * 501); // 200-700ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeError(code, msg) {
  const err = new Error("[" + code + "] " + msg);
  err.code = code;
  return err;
}

// 抓取页面：404 -> NOT_FOUND，429/403 -> RATE_LIMITED，其余非 2xx -> API_ERROR
async function fetchPage(url) {
  await sleepRandom();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (res.status === 404) throw makeError("NOT_FOUND", "Techmeme story not found (invalid date or story id)");
    if (res.status === 429 || res.status === 403) throw makeError("RATE_LIMITED", "Techmeme rate-limited the request (HTTP " + res.status + ")");
    if (!res.ok) throw makeError("API_ERROR", "Techmeme returned HTTP " + res.status);
    return await res.text();
  } catch (e) {
    if (e && e.code) throw e;
    if (e && e.name === "AbortError") throw makeError("NETWORK_ERROR", "Techmeme request timed out");
    throw makeError("NETWORK_ERROR", "Failed to reach Techmeme: " + (e && e.message ? e.message : String(e)));
  } finally {
    clearTimeout(timer);
  }
}

// 解析 CITE 区块：形如 "Ina Fried / <A>Axios</A>:"（有作者）或 "<A>Anthropic</A>:"（纯来源）
function parseCite(citeHtml) {
  const aRe = /<A\s+HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/i;
  const m = aRe.exec(citeHtml);
  if (!m) return { author: null, source: "", source_url: "" };
  const source = cleanText(m[2]);
  const source_url = m[1];
  const before = citeHtml.slice(0, m.index);
  let author = cleanText(before).replace(/[\/—:]\s*$/, "").trim();
  if (!author) author = null;
  return { author: author, source: source, source_url: source_url };
}

// 解析展开态 More: 段的单个 .di 条目 -> { author, source, source_url, title, url }
function parseDi(diHtml) {
  const citeRe = /<CITE>([\s\S]*?)<\/CITE>/i;
  const citeMatch = citeRe.exec(diHtml);
  if (!citeMatch) return null;
  const parsed = parseCite(citeMatch[1]);
  const afterCite = diHtml.slice(citeMatch.index + citeMatch[0].length);
  const aRe = /<A\s+HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/i;
  const m = aRe.exec(afterCite);
  if (!m) return null;
  return {
    author: parsed.author,
    source: parsed.source,
    source_url: parsed.source_url,
    title: cleanText(m[2]),
    url: m[1]
  };
}

// 折叠态 bls span 内的链接列表 -> [{ handle, url }]
function parseBls(blsHtml) {
  const items = [];
  const aRe = /<A\s+HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/gi;
  let m;
  while ((m = aRe.exec(blsHtml)) !== null) {
    items.push({ handle: cleanText(m[2]), url: m[1] });
  }
  return items;
}

// related：用展开态 {idx}p1 隐藏 div 的 More: 段（含 author+source+source_url+title+url，信息最全）
// 注意：item 索引非固定 0（多故事聚合簇用 1d1/1p1 等），用 \d+ 匹配任意索引
function extractRelated(cluster) {
  const p1Re = /<DIV\s+ID="\d+p1"[^>]*>/i;
  const p1Match = p1Re.exec(cluster);
  if (!p1Match) return [];
  const p1 = extractBalancedDiv(cluster, p1Match.index);
  if (!p1) return [];
  const moreRe = /<DIV\s+CLASS="drhed">More:<\/DIV>/i;
  const moreMatch = moreRe.exec(p1);
  if (!moreMatch) return [];
  const headerRe = /<DIV\s+CLASS="drhed">([^<]+):<\/DIV>/gi;
  headerRe.lastIndex = moreMatch.index + moreMatch[0].length;
  const nextHeader = headerRe.exec(p1);
  const sectionEnd = nextHeader ? nextHeader.index : p1.length;
  const section = p1.slice(moreMatch.index + moreMatch[0].length, sectionEnd);
  const items = [];
  const diRe = /<DIV\s+CLASS="di">([\s\S]*?)<\/DIV>/gi;
  let m;
  while ((m = diRe.exec(section)) !== null) {
    const item = parseDi(m[1]);
    if (item) items.push(item);
  }
  return items;
}

// discussions：用折叠态 {idx}d1 的 SPAN drhed 分组（X / LinkedIn / Bluesky / Mastodon / Forums）
// 注意：item 索引非固定 0（多故事聚合簇用 1d1/1p1 等），用 \d+ 匹配任意索引
function extractDiscussions(cluster) {
  const result = { x: [], linkedin: [], bluesky: [], mastodon: [], forums: [] };
  const d1Re = /<DIV\s+ID="\d+d1"[^>]*>/i;
  const d1Match = d1Re.exec(cluster);
  if (!d1Match) return result;
  const d1 = extractBalancedDiv(cluster, d1Match.index);
  if (!d1) return result;
  const keyMap = { "X": "x", "LinkedIn": "linkedin", "Bluesky": "bluesky", "Mastodon": "mastodon", "Forums": "forums" };
  const spanRe = /<SPAN\s+CLASS="drhed">([^<:]+):<\/SPAN>\s*(?:&nbsp;)?\s*<span class="bls">([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = spanRe.exec(d1)) !== null) {
    const key = keyMap[m[1].trim()];
    if (!key) continue;
    result[key] = parseBls(m[2]);
  }
  return result;
}

// social_posts：主 span 属性 twurl(X)/mdurl(Mastodon)/bsurl(Bluesky)/thurl(Threads)
function extractSocialPosts(cluster) {
  const result = { x: "", mastodon: "", bluesky: "", threads: "" };
  const spanRe = /<span\b[^>]*pml="[^"]*"[^>]*>/i;
  const m = spanRe.exec(cluster);
  if (!m) return result;
  const tag = m[0];
  const getAttr = (name) => {
    const r = new RegExp(name + "=\"([^\"]*)\"", "i").exec(tag);
    return r ? r[1] : "";
  };
  result.x = getAttr("twurl");
  result.mastodon = getAttr("mdurl");
  result.bluesky = getAttr("bsurl");
  result.threads = getAttr("thurl");
  return result;
}

export default async function(params) {
  const rawUrl = String(params.url || "").trim();
  if (!rawUrl) throw makeError("MISSING_PARAM", "url is required (Techmeme story permalink)");

  // 路径参数：先用正则校验原始串再使用，禁止 parseInt 截断
  const urlMatch = rawUrl.match(/^https?:\/\/www\.techmeme\.com\/(\d{6})\/p(\d+)\/?$/i);
  if (!urlMatch) {
    throw makeError("INVALID_PARAM", "url must match https://www.techmeme.com/{yymmdd}/p<N>");
  }
  const yymmdd = urlMatch[1];
  const pnum = urlMatch[2];
  const anchorName = "a" + yymmdd + "p" + pnum;

  const html = await fetchPage(rawUrl);

  // 锚点定位该簇；多个锚点（别名）可能指向同一 itc2 簇
  const anchorRe = new RegExp("<A\\s+NAME=\"" + anchorName + "\"[^>]*>", "i");
  const anchorMatch = anchorRe.exec(html);
  if (!anchorMatch) throw makeError("NOT_FOUND", "Story cluster " + yymmdd + "/p" + pnum + " not found on snapshot page");

  // 取锚点后第一个 itc2 簇，其 ID 为规范 id（别名簇回填规范 id）
  // 注意：必须带 g 标志，lastIndex 才会生效（不带 g 的 exec 总是从头搜索）
  const itc2Re = /<DIV\s+CLASS="itc2"\s+ID="([^"]+)"/gi;
  itc2Re.lastIndex = anchorMatch.index;
  const itc2Match = itc2Re.exec(html);
  if (!itc2Match) throw makeError("API_ERROR", "Unexpected Techmeme page structure: no cluster after anchor " + anchorName);

  const canonicalId = itc2Match[1];
  const cluster = extractBalancedDiv(html, itc2Match.index);
  if (!cluster) throw makeError("API_ERROR", "Unexpected Techmeme page structure: failed to parse cluster " + canonicalId);

  // permalink 回填规范 id；date 从 URL yymmdd 派生（页面无时刻时间戳）
  const permalink = "https://www.techmeme.com/" + canonicalId.slice(0, 6) + "/" + canonicalId.slice(6);
  const date = "20" + yymmdd.slice(0, 2) + "-" + yymmdd.slice(2, 4) + "-" + yymmdd.slice(4, 6);

  // 主报道：CITE 提取作者/来源
  const citeRe = /<CITE>([\s\S]*?)<\/CITE>/i;
  const citeMatch = citeRe.exec(cluster);
  let author = null;
  let source = { name: "", url: "" };
  if (citeMatch) {
    const c = parseCite(citeMatch[1]);
    author = c.author;
    source = { name: c.source, url: c.source_url };
  }

  // 主报道：ii div 提取标题/原文链接/摘要/配图
  const iiRe = /<DIV\s+CLASS="ii"[^>]*>/i;
  const iiMatch = iiRe.exec(cluster);
  let url = "";
  let title = "";
  let summary = "";
  let image = null;
  if (iiMatch) {
    const ii = extractBalancedDiv(cluster, iiMatch.index);
    if (ii) {
      const ourhRe = /<A\s+CLASS="ourh"\s+HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>/i;
      const ourh = ourhRe.exec(ii);
      if (ourh) {
        url = ourh[1];
        title = cleanText(ourh[2]);
        const afterAnchor = ii.slice(ourh.index + ourh[0].length)
          .replace(/<\/?STRONG[^>]*>/i, "")
          .replace(/^\s*(?:&nbsp;)?\s*(?:&mdash;|--)\s*(?:&nbsp;)?/i, "");
        summary = cleanText(afterAnchor).replace(/\s*(?:\.{3}|…)\s*$/, "").trim();
      }
      const imgRe = /<IMG\b[^>]*>/gi;
      let im;
      while ((im = imgRe.exec(ii)) !== null) {
        if (/class="ill"/i.test(im[0])) {
          const src = /SRC="([^"]*)"/i.exec(im[0]);
          if (src && src[1]) image = "https://www.techmeme.com" + src[1];
          break;
        }
      }
    }
  }

  return {
    title: title,
    summary: summary,
    author: author,
    source: source,
    url: url,
    permalink: permalink,
    image: image,
    date: date,
    related: extractRelated(cluster),
    discussions: extractDiscussions(cluster),
    social_posts: extractSocialPosts(cluster)
  };
}
