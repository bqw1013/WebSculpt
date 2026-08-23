// techmeme/get-leaderboard — Techmeme 作者影响力榜单（Leadership/Presence），支持历史快照
// 数据源：当前榜取 /lbdocs/table__general__Techmeme_{Leadership|Presence}.html（静态表片段，含作者+媒体两表）；
//         历史榜取 /{yymmdd}/lb（服务端内联 4 张表，取 {Board}_authors）。仅解析作者表（各 50 行）。

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// board 枚举 → Techmeme 内部表名后缀
const BOARDS = {
  leadership: "Leadership",
  presence: "Presence",
};

function businessError(code, msg) {
  const err = new Error("[" + code + "] " + msg);
  err.code = code;
  return err;
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// 去掉 HTML 标签、解码实体、压缩空白
function cellText(cellHtml) {
  return decodeEntities(cellHtml.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

// 解析 Sources 单元格。
// 简单格式：<a href="...">Bloomberg</a>&nbsp;(#1)           → {name, rank:1, percentage:null}
// 详细格式：1.048%:&nbsp;<a>Bloomberg</a>&nbsp;(#1), 0.110%:&nbsp;<a>@handle</a>
//    → 前条带 percentage 与 rank，后条（Bluesky 等非媒体）rank 为 null；也允许混合格式（首条无百分比前缀）。
function parseSources(cellHtml) {
  const sources = [];
  const re = /(?:(\d+(?:\.\d+)?)%:&nbsp;)?<a href="[^"]*">([^<]*)<\/a>(?:&nbsp;\(#(\d+)\))?/g;
  let m;
  while ((m = re.exec(cellHtml)) !== null) {
    const percentage = m[1] !== undefined ? parseFloat(m[1]) : null;
    const name = decodeEntities(m[2]).replace(/\s+/g, " ").trim();
    const rank = m[3] !== undefined ? parseInt(m[3], 10) : null;
    sources.push({ name, rank, percentage });
  }
  return sources;
}

// 解析作者表 HTML（表头行 + 数据行）。表头可能是 <th>（静态表）或 <td>（历史页），
// 统一通过 rank 非数字跳过。历史页行 11-50 带 style="display:none"，但 HTML 中完整存在，不影响解析。
function parseAuthorsTable(tableHtml) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(tableHtml)) !== null) {
    const rowContent = m[1];
    if (/<\/t[hH]>/.test(rowContent)) continue;
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm;
    while ((cm = tdRe.exec(rowContent)) !== null) {
      cells.push(cm[1]);
    }
    if (cells.length < 5) continue;
    const rank = parseInt(cells[0], 10);
    if (!Number.isInteger(rank) || rank < 1) continue;

    const author = cellText(cells[1]);

    const twitterCell = cells[2].trim();
    let twitter = null;
    if (twitterCell && !/&nbsp;/.test(twitterCell)) {
      twitter = cellText(twitterCell);
    }

    const pctMatch = cells[3].match(/(\d+(?:\.\d+)?)%/);
    const percentage = pctMatch ? parseFloat(pctMatch[1]) : null;

    const sources = parseSources(cells[4]);

    rows.push({ rank, author, twitter, percentage, sources });
  }
  return rows;
}

// 当前榜静态表：<header id="authors">...<table> 作者行 </table><header id="publications">...<table>
// 取 publications 前的第一张表。
function parseCurrentPage(html) {
  const pubsIdx = html.indexOf('id="publications"');
  const section = pubsIdx >= 0 ? html.slice(0, pubsIdx) : html;
  const ts = section.indexOf("<table");
  const te = section.indexOf("</table>", ts);
  if (ts < 0 || te < 0) return null;
  return parseAuthorsTable(section.slice(ts, te));
}

// 历史榜页面：<table id="{Board}_authors">。注意别与 <h3 id="a{Board}_authors"> 混淆，
// 用精确的 id="Leadership_authors" 子串定位即可区分。
function parseHistoricalPage(html, boardKey) {
  const tableId = 'id="' + BOARDS[boardKey] + '_authors"';
  const start = html.indexOf(tableId);
  if (start < 0) return null;
  const ts = html.lastIndexOf("<table", start);
  const te = html.indexOf("</table>", start);
  if (ts < 0 || te < 0 || te <= ts) return null;
  return parseAuthorsTable(html.slice(ts, te));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 请求 pacing：每次请求前随机 sleep 200-700ms（Techmeme 实测不限速，但按用户规范统一降速）
async function randomSleep() {
  const ms = 200 + Math.floor(Math.random() * 501);
  await sleep(ms);
}

// YYYY-MM-DD → yymmdd（如 2026-08-14 → 260814）。格式或历法非法 → INVALID_PARAM。
function dateToYymmdd(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw businessError("INVALID_PARAM", "date 必须为 YYYY-MM-DD 格式，例如 2026-08-14，实际为: " + dateStr);
  }
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const d = parseInt(dateStr.slice(8, 10), 10);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw businessError("INVALID_PARAM", "date 不是有效日期: " + dateStr);
  }
  return String(y).slice(-2) + String(m).padStart(2, "0") + String(d).padStart(2, "0");
}

async function fetchText(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": CHROME_UA,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (e) {
    throw businessError("NETWORK_ERROR", "请求 Techmeme 失败: " + url + " — " + e.message);
  }
  if (res.status === 404) {
    throw businessError("NOT_FOUND", "该日期没有 Techmeme 榜单快照（404）: " + url);
  }
  if (res.status === 429) {
    throw businessError("RATE_LIMITED", "请求过于频繁（429）: " + url);
  }
  if (!res.ok) {
    throw businessError("API_ERROR", "Techmeme 返回异常状态 " + res.status + ": " + url);
  }
  return await res.text();
}

export default async function(params) {
  const boardRaw = typeof params.board === "string" ? params.board.trim().toLowerCase() : "";
  if (!BOARDS[boardRaw]) {
    throw businessError(
      "INVALID_PARAM",
      "board 必须是 leadership（报道主导占比榜）或 presence（报道出现占比榜），实际为: " + params.board
    );
  }

  let limit = 50;
  if (params.limit !== undefined && params.limit !== null && params.limit !== "") {
    if (!/^\d+$/.test(String(params.limit))) {
      throw businessError("INVALID_PARAM", "limit 必须为 1-50 的整数，实际为: " + params.limit);
    }
    limit = parseInt(String(params.limit), 10);
    if (limit < 1 || limit > 50) {
      throw businessError("INVALID_PARAM", "limit 必须在 1-50 之间，实际为: " + params.limit);
    }
  }

  let url;
  let historical = false;
  if (params.date !== undefined && params.date !== null && params.date !== "") {
    const yymmdd = dateToYymmdd(params.date);
    url = "https://www.techmeme.com/" + yymmdd + "/lb";
    historical = true;
  } else {
    url = "https://www.techmeme.com/lbdocs/table__general__Techmeme_" + BOARDS[boardRaw] + ".html";
  }

  await randomSleep();
  const html = await fetchText(url);

  const rows = historical ? parseHistoricalPage(html, boardRaw) : parseCurrentPage(html);
  if (!rows || rows.length === 0) {
    throw businessError("DRIFT_DETECTED", "未能从 " + url + " 解析出作者榜单表格，页面结构可能已变化");
  }

  return rows.slice(0, limit);
}
