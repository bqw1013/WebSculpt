// stocktwits/list-earnings — Stocktwits earnings calendar for a given week.
// SSR-HTML endpoint, anonymous, no login, no browser. Node runtime.
//
// URL: https://stocktwits.com/sentiment/calendar?date=YYYY-MM-DD
// Data: <script id="__NEXT_DATA__" type="application/json"> → props.pageProps.initialData.earningsData
//
// CRITICAL SEMANTICS (verified during explore — do NOT "simplify" this away):
//   earningsData.earnings is an object keyed by day-bucket date (Mon-Fri of the
//   queried week). Each stock inside carries its own `date` field = that stock's
//   actual scheduled earnings date. For the CURRENT or a PAST week, the PAST-day
//   buckets are FORWARD-FILLED with the stock's NEXT earnings date, which lies
//   OUTSIDE the queried week (e.g. in November). Fully-past weeks are almost
//   entirely forward-filled (807 stocks, only 19 inside the queried week). The
//   site does not archive past earnings.
//   => Filter every stock by `stock.date ∈ [date_from, date_to]`, then group by
//   `stock.date`. Future weeks are self-consistent and unaffected by the filter.
//
// Error codes: INVALID_PARAM / NOT_FOUND / RATE_LIMITED / API_ERROR / NETWORK_ERROR.

const BASE_URL = 'https://stocktwits.com/sentiment/calendar';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Strict YYYY-MM-DD calendar-date check. Rejects both bad formats ("2026/11/09",
// "abc", "2026-11-9") and non-existent dates ("2026-02-30", "2026-13-99").
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDays(dateStr, delta) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Fetch the calendar HTML. Random 200-700ms polite-pacing sleep before EVERY request.
// Retries with linear backoff (1s, 2s) on 429/403, network errors/timeouts, and
// soft degradation (a 200 body missing the __NEXT_DATA__ marker). Max 3 attempts.
async function fetchCalendarHtml(url) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await sleep(randomBetween(200, 700));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        headers: {
          'user-agent': UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'cache-control': 'no-cache'
        },
        redirect: 'follow',
        signal: controller.signal
      });

      if (resp.status === 429 || resp.status === 403) {
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * attempt);
          continue;
        }
        fail('RATE_LIMITED', `Calendar endpoint rate-limited/blocked (HTTP ${resp.status}) after ${MAX_RETRIES} attempts`);
      }
      if (resp.status === 404) {
        fail('NOT_FOUND', `Calendar page returned 404 for ${url}`);
      }
      if (resp.status !== 200) {
        fail('API_ERROR', `Unexpected HTTP ${resp.status} from ${url}`);
      }

      const html = await resp.text();
      if (!html || !html.includes('__NEXT_DATA__')) {
        // Soft degradation: 200 but the SSR marker is missing. Retry; if it
        // persists the page structure has likely changed (e.g. client-rendered).
        lastErr = new Error('200 response missing __NEXT_DATA__ marker (soft degradation)');
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * attempt);
          continue;
        }
        fail('API_ERROR', 'Calendar page served 200 without __NEXT_DATA__ (structure likely changed)');
      }
      return html;
    } catch (err) {
      if (err && err.code) throw err; // business error — do not retry
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * attempt);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  fail('NETWORK_ERROR', lastErr && lastErr.message ? lastErr.message : 'Failed to fetch calendar page');
}

// Extract earningsData from the embedded __NEXT_DATA__ JSON. Returns null when
// the marker or the expected path is missing.
function extractEarningsData(html) {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return null;
  }
  const initialData =
    parsed && parsed.props && parsed.props.pageProps && parsed.props.pageProps.initialData;
  const earningsData = initialData && initialData.earningsData;
  if (
    !earningsData ||
    typeof earningsData.date_from !== 'string' ||
    typeof earningsData.date_to !== 'string' ||
    !earningsData.earnings ||
    typeof earningsData.earnings !== 'object'
  ) {
    return null;
  }
  return earningsData;
}

// The stock fields to keep, matching the verified raw structure. Importance is a
// numeric heat score; time is Pre-Market | After Hours | During Market | "".
const STOCK_FIELDS = [
  'symbol', 'date', 'title', 'importance', 'time',
  'last_price', 'change', 'percent_change', 'volume'
];

function pickStock(rawStock) {
  const stock = {};
  for (const key of STOCK_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rawStock, key)) stock[key] = rawStock[key];
  }
  return stock;
}

// Filter every stock by its real earnings date being inside the queried week,
// then group by that date. See the top-of-file comment for why the raw day
// buckets cannot be returned verbatim (forward-fill of past days).
function buildDays(earningsData) {
  const dateFrom = earningsData.date_from;
  const dateTo = earningsData.date_to;
  const stocksByDate = {};

  for (const [bucketDate, bucket] of Object.entries(earningsData.earnings)) {
    const list = Array.isArray(bucket && bucket.stocks) ? bucket.stocks : [];
    for (const rawStock of list) {
      if (!rawStock || typeof rawStock.date !== 'string') continue;
      if (rawStock.date >= dateFrom && rawStock.date <= dateTo) {
        if (!stocksByDate[rawStock.date]) stocksByDate[rawStock.date] = [];
        stocksByDate[rawStock.date].push(pickStock(rawStock));
      }
    }
  }

  // Emit every calendar day from date_from to date_to (normally Mon-Fri), each
  // with its filtered stocks (empty array when none report that day). The day
  // name is computed from the date itself — the server's bucket `day` field uses
  // relative UI labels ("Today"/"Yesterday") that shift daily, so it is NOT used.
  const days = [];
  let cursor = dateFrom;
  let steps = 0;
  const guard = 400; // data window is ~1 year, so this is a hard safety bound
  while (cursor <= dateTo && steps < guard) {
    const y = Number(cursor.slice(0, 4));
    const m = Number(cursor.slice(5, 7));
    const d = Number(cursor.slice(8, 10));
    const day = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    days.push({ date: cursor, day, stocks: stocksByDate[cursor] || [] });
    cursor = addDays(cursor, 1);
    steps++;
  }
  return days;
}

export default async function(params) {
  const dateParam = params.date;
  let url = BASE_URL;
  if (dateParam !== undefined && dateParam !== null && String(dateParam).trim() !== '') {
    const date = String(dateParam).trim();
    if (!isValidDate(date)) {
      fail('INVALID_PARAM', `Invalid --date "${date}": expected a YYYY-MM-DD calendar date`);
    }
    url = `${BASE_URL}?date=${date}`;
  }

  const html = await fetchCalendarHtml(url);
  const earningsData = extractEarningsData(html);
  if (!earningsData) {
    fail('API_ERROR', '__NEXT_DATA__ earningsData missing from calendar page (structure likely changed)');
  }

  return {
    week: { from: earningsData.date_from, to: earningsData.date_to },
    days: buildDays(earningsData)
  };
}
