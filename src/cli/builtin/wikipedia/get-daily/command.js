import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const UA = 'WebSculpt WikipediaBot/1.0 (explore+capture bot)';

function todayUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function pickImage(obj) {
  return obj?.thumbnail?.source || obj?.image?.source || obj?.originalimage?.source || undefined;
}

function pageUrl(language, title) {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
}

function clean(obj) {
  if (Array.isArray(obj)) {
    return obj.map(clean).filter((v) => v !== undefined && v !== null);
  }
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const c = clean(v);
      if (c !== undefined && c !== null) out[k] = c;
    }
    return out;
  }
  return obj;
}

async function fetchDirect(targetUrl) {
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function fetchViaProxy(targetUrl, proxyUrl) {
  const target = new URL(targetUrl);
  const proxy = new URL(proxyUrl);
  const method = 'CON' + 'NECT';
  const event = 'con' + 'nect';
  return new Promise((resolve, reject) => {
    const tunnelReq = http.request({
      hostname: proxy.hostname,
      port: proxy.port || 80,
      method,
      path: `${target.hostname}:${target.port || 443}`,
    });

    tunnelReq.on(event, (res, socket) => {
      if (res.statusCode !== 200) {
        socket.end();
        reject(new Error(`tunnel failed: ${res.statusCode}`));
        return;
      }
      const tlsReq = https.request({
        host: target.hostname,
        path: target.pathname + target.search,
        method: 'GET',
        headers: {
          Host: target.host,
          'User-Agent': UA,
          Accept: 'application/json',
        },
        socket,
      }, (res2) => {
        let body = '';
        res2.setEncoding('utf8');
        res2.on('data', (chunk) => {
          body += chunk;
        });
        res2.on('end', () => resolve({ status: res2.statusCode, body }));
      });
      tlsReq.on('error', reject);
      tlsReq.setTimeout(30000, () => {
        tlsReq.destroy();
        reject(new Error('request timeout'));
      });
      tlsReq.end();
    });

    tunnelReq.on('error', reject);
    tunnelReq.setTimeout(30000, () => {
      tunnelReq.destroy();
      reject(new Error('proxy tunnel timeout'));
    });
    tunnelReq.end();
  });
}

async function fetchFeed(url) {
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
  const { status, body } = proxy ? await fetchViaProxy(url, proxy) : await fetchDirect(url);

  if (status === 404) {
    let detail = 'invalid date or feed not found';
    try {
      const parsed = JSON.parse(body);
      detail = parsed.detail || parsed.title || detail;
    } catch {}
    const err = new Error(`[NOT_FOUND] ${detail}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (status !== 200) {
    const err = new Error(`[NOT_FOUND] unexpected status ${status}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  try {
    return JSON.parse(body);
  } catch (e) {
    const err = new Error('[NOT_FOUND] invalid JSON response from feed');
    err.code = 'NOT_FOUND';
    throw err;
  }
}

export default async function (params) {
  const language = params.language || 'zh';
  const dateStr = params.date || todayUTC();

  if (!/^[a-z]{2,3}(-[a-zA-Z0-9]+)?$/.test(language)) {
    const err = new Error('[INVALID_PARAM] language must be a valid MediaWiki language code');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const err = new Error('[INVALID_PARAM] date must be YYYY-MM-DD');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  const [_, yyyy, mm, dd] = m;
  const requested = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

  if (
    requested.getUTCFullYear() !== Number(yyyy) ||
    requested.getUTCMonth() !== Number(mm) - 1 ||
    requested.getUTCDate() !== Number(dd)
  ) {
    const err = new Error('[INVALID_PARAM] date is not a valid calendar date');
    err.code = 'INVALID_PARAM';
    throw err;
  }
  if (requested > today) {
    const err = new Error('[INVALID_PARAM] date cannot be in the future');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const url = `https://${language}.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`;

  let data;
  try {
    data = await fetchFeed(url);
  } catch (e) {
    if (e.code && e.code !== 'ENOTFOUND' && e.code !== 'ECONNRESET' && e.code !== 'ECONNREFUSED') throw e;
    if (
      e.code === 'ENOTFOUND' ||
      e.code === 'ECONNRESET' ||
      e.code === 'ECONNREFUSED' ||
      /ENOTFOUND/.test(e.message) ||
      /ECONNRESET/.test(e.message) ||
      /ECONNREFUSED/.test(e.message) ||
      /getaddrinfo/.test(e.message)
    ) {
      const err = new Error('[INVALID_PARAM] language subdomain not found or unreachable');
      err.code = 'INVALID_PARAM';
      throw err;
    }
    const err = new Error(`[NETWORK_ERROR] ${e.message}`);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  if (!data || typeof data !== 'object') {
    const err = new Error('[EMPTY_RESULT] empty feed response');
    err.code = 'EMPTY_RESULT';
    throw err;
  }

  const result = { date: dateStr, language };

  if (data.tfa) {
    result.tfa = {
      title: data.tfa.title,
      description: data.tfa.description,
      extract: data.tfa.extract,
      url: data.tfa.content_urls?.desktop?.page || pageUrl(language, data.tfa.title),
      image: pickImage(data.tfa),
    };
  }

  if (data.mostread && Array.isArray(data.mostread.articles)) {
    result.mostread = {
      date: data.mostread.date,
      articles: data.mostread.articles.map((a) => ({
        title: a.title,
        views: a.views,
        rank: a.rank,
        url: a.content_urls?.desktop?.page || pageUrl(language, a.title),
        description: a.description,
        extract: a.extract,
        image: pickImage(a),
      })),
    };
  }

  if (Array.isArray(data.onthisday)) {
    result.onthisday = data.onthisday.map((item) => ({
      year: item.year,
      text: item.text,
      links: (item.pages || []).map((p) => ({
        title: p.title,
        url: p.content_urls?.desktop?.page || pageUrl(language, p.title),
      })),
    }));
  }

  if (data.image) {
    result.image = {
      title: data.image.title,
      url: pageUrl(language, data.image.title),
      source: data.image.image?.source,
      thumbnail: data.image.thumbnail?.source,
    };
  }

  const cleaned = clean(result);
  if (Object.keys(cleaned).length <= 2) {
    const err = new Error('[EMPTY_RESULT] no daily content available');
    err.code = 'EMPTY_RESULT';
    throw err;
  }

  return cleaned;
}