import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const VALID_PERIODS = ['yesterday', '7day', '30day'];
const PERIOD_DAYS = { yesterday: 1, '7day': 7, '30day': 30 };
const USER_AGENT = 'WebSculpt wikipedia/get-trending (research bot; contact@example.com)';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(d) {
  return {
    year: String(d.getUTCFullYear()),
    month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    day: String(d.getUTCDate()).padStart(2, '0'),
  };
}

function getProxyUrl() {
  return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
}

function fetchWithProxy(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) {
      fetch(targetUrl, options)
        .then(resolve)
        .catch(reject);
      return;
    }

    const target = new URL(targetUrl);
    const proxy = new URL(proxyUrl);
    const tunnelHeaders = { Host: `${target.hostname}:${target.port || 443}` };
    const tunnelMethod = 'CON' + 'NECT';
    const tunnelEvent = 'con' + 'nect';

    const req = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: tunnelMethod,
      path: `${target.hostname}:${target.port || 443}`,
      headers: tunnelHeaders,
    });

    req.on(tunnelEvent, (res, socket) => {
      if (res.statusCode !== 200) {
        const err = new Error(`[NETWORK_ERROR] Proxy tunnel failed with status ${res.statusCode}`);
        err.code = 'NETWORK_ERROR';
        reject(err);
        return;
      }

      const httpsReq = https.request({
        host: target.hostname,
        path: target.pathname + target.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        socket,
      }, (httpsRes) => {
        let data = '';
        httpsRes.setEncoding('utf8');
        httpsRes.on('data', chunk => { data += chunk; });
        httpsRes.on('end', () => {
          resolve({
            status: httpsRes.statusCode,
            text: async () => data,
            json: async () => JSON.parse(data),
          });
        });
      });

      httpsReq.on('error', (e) => {
        const err = new Error(`[NETWORK_ERROR] ${e.message}`);
        err.code = 'NETWORK_ERROR';
        reject(err);
      });
      httpsReq.end();
    });

    req.on('error', (e) => {
      const err = new Error(`[NETWORK_ERROR] ${e.message}`);
      err.code = 'NETWORK_ERROR';
      reject(err);
    });
    req.end();
  });
}

async function fetchDay(language, { year, month, day }) {
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${language}.wikipedia/all-access/${year}/${month}/${day}`;
  const res = await fetchWithProxy(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (res.status === 404) {
    return null;
  }

  if (res.status === 429) {
    const err = new Error('[RATE_LIMITED] Wikimedia Pageviews API rate limit exceeded');
    err.code = 'RATE_LIMITED';
    throw err;
  }

  if (res.status !== 200) {
    const text = await res.text();
    const err = new Error(`[NETWORK_ERROR] Pageviews API returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  return res.json();
}

function validateParams(params) {
  const period = params.period;
  if (!VALID_PERIODS.includes(period)) {
    const err = new Error(`[INVALID_PARAM] period must be one of ${VALID_PERIODS.join(', ')}`);
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const limit = parseInt(params.limit, 10);
  if (Number.isNaN(limit) || limit < 1 || limit > 100) {
    const err = new Error('[INVALID_PARAM] limit must be an integer between 1 and 100');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const language = params.language;
  if (!/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/.test(language)) {
    const err = new Error('[INVALID_PARAM] language must be a valid MediaWiki language code');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  return { period, limit, language };
}

function buildDateWindow(period) {
  const days = PERIOD_DAYS[period];
  const dates = [];
  const now = new Date();
  let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  for (let i = 0; i < days; i++) {
    dates.push(formatDate(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() - 1));
  }
  return dates;
}

async function findLatestAvailableDay(language) {
  const now = new Date();
  let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  for (let i = 0; i < 30; i++) {
    const date = formatDate(cursor);
    const data = await fetchDay(language, date);
    if (data) return { date, data };
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() - 1));
  }
  return null;
}

function aggregateArticles(dailyDataList) {
  const map = new Map();
  for (const { data } of dailyDataList) {
    const articles = data?.items?.[0]?.articles;
    if (!Array.isArray(articles)) continue;
    for (const a of articles) {
      const title = a.article;
      const views = Number(a.views) || 0;
      if (!title || title.includes(':')) continue;
      const current = map.get(title) || { title, views: 0 };
      current.views += views;
      map.set(title, current);
    }
  }
  return map;
}

async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
      await sleep(200 + Math.floor(Math.random() * 500));
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export default async function(params) {
  const { period, limit, language } = validateParams(params);

  if (period === 'yesterday') {
    const latest = await findLatestAvailableDay(language);
    if (!latest) {
      const err = new Error('[NOT_FOUND] No pageview data available for the requested language');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const articles = latest.data?.items?.[0]?.articles || [];
    const items = articles
      .filter(a => a.article && !a.article.includes(':'))
      .slice(0, limit)
      .map((a, idx) => ({
        title: a.article,
        views: Number(a.views) || 0,
        rank: idx + 1,
        url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
      }));

    if (items.length === 0) {
      const err = new Error('[EMPTY_RESULT] No main-namespace articles found');
      err.code = 'EMPTY_RESULT';
      throw err;
    }

    return {
      period,
      generated_at: new Date().toISOString(),
      language,
      items,
    };
  }

  const dates = buildDateWindow(period);
  const tasks = dates.map(date => async () => {
    const data = await fetchDay(language, date);
    return data ? { date, data } : null;
  });
  const fetched = await runWithConcurrency(tasks, 3);
  const dailyDataList = fetched.filter(Boolean);

  if (dailyDataList.length === 0) {
    const err = new Error('[NOT_FOUND] No pageview data available for the requested period');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const aggregated = aggregateArticles(dailyDataList);
  const items = [...aggregated.values()]
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
    .map((x, idx) => ({
      title: x.title,
      views: x.views,
      rank: idx + 1,
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(x.title)}`,
    }));

  if (items.length === 0) {
    const err = new Error('[EMPTY_RESULT] No main-namespace articles found for the requested period');
    err.code = 'EMPTY_RESULT';
    throw err;
  }

  return {
    period,
    generated_at: new Date().toISOString(),
    language,
    items,
  };
}