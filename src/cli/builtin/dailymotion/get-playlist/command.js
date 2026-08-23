// dailymotion/get-playlist
// Fetch a Dailymotion playlist (name, description, owner, video count) and its videos in playlist order
// via the public REST API (api.dailymotion.com). No login, no browser.
// Polite pacing: sleeps a random 200-700ms before every HTTP request; never bursts the API.
import { setTimeout as sleep } from 'node:timers/promises';

const API = 'https://api.dailymotion.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PLAYLIST_FIELDS = 'id,name,description,videos_total,thumbnail_720_url,created_time,updated_time,private,owner.id,owner.screenname,owner.username,owner.url';
const VIDEO_FIELDS = 'id,title,url,duration,thumbnail_url,created_time,views_total,owner.screenname,owner.username,owner.url';
const MAX_LIMIT = 100;
const MAX_PAGES = 10; // API serves at most 1000 playlist videos (10 pages x 100)
const MAX_ATTEMPTS = 3; // transient network / 5xx / bad JSON are retried up to twice with backoff

function bizError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

function randomSleepMs() {
  return 200 + Math.floor(Math.random() * 501); // 200-700ms
}

function backoffSleep() {
  return sleep(1000 + Math.floor(Math.random() * 501)); // 1000-1500ms before retry
}

// Extract the playlist id from a playlist URL or accept a bare id.
// Handles https://www.dailymotion.com/playlist/xa5jms, /playlist/xa5jms/ , and "xa5jms".
function extractPlaylistId(input) {
  const m = String(input).match(/\/playlist\/([a-zA-Z0-9]+)/);
  if (m) return m[1];
  const trimmed = String(input).trim();
  return /^[a-zA-Z0-9]+$/.test(trimmed) ? trimmed : null;
}

// Dailymotion descriptions may contain HTML (<br />, entities). Flatten to plain text.
function cleanText(text) {
  if (text === null || text === undefined) return null;
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/\s+/g, ' ')
    .trim() || null;
}

async function apiGet(url) {
  let lastCause = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await sleep(randomSleepMs());
    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(20000),
      });
    } catch (cause) {
      lastCause = cause;
      if (attempt < MAX_ATTEMPTS) {
        await backoffSleep();
        continue;
      }
      bizError('COMMAND_EXECUTION_ERROR', `Network error calling Dailymotion API: ${cause.message}`);
    }

    // Definitive HTTP statuses — never retried.
    if (res.status === 404) {
      bizError('NOT_FOUND', 'Playlist not found (Dailymotion API returned HTTP 404)');
    }
    if (res.status === 429 || res.status === 403) {
      bizError('RATE_LIMITED', `Dailymotion API rate-limited (HTTP ${res.status})`);
    }

    // Transient server errors (5xx) — retry once with backoff.
    if (res.status >= 500) {
      lastCause = new Error(`HTTP ${res.status}`);
      if (attempt < MAX_ATTEMPTS) {
        await backoffSleep();
        continue;
      }
      bizError('COMMAND_EXECUTION_ERROR', `Dailymotion API returned HTTP ${res.status} after retries`);
    }

    let json;
    try {
      json = await res.json();
    } catch {
      lastCause = new Error('invalid JSON body');
      if (attempt < MAX_ATTEMPTS) {
        await backoffSleep();
        continue;
      }
      bizError('COMMAND_EXECUTION_ERROR', `Invalid JSON from Dailymotion API (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const message = json && json.error && json.error.message ? json.error.message : `HTTP ${res.status}`;
      if (message.includes('Unrecognized value')) {
        bizError('DRIFT_DETECTED', `Dailymotion API field drift: ${message}`);
      }
      bizError('API_ERROR', `Dailymotion API error (HTTP ${res.status}): ${message}`);
    }
    return json;
  }
  bizError('COMMAND_EXECUTION_ERROR', `Dailymotion API request failed after ${MAX_ATTEMPTS} attempts: ${lastCause ? lastCause.message : 'unknown'}`);
}

function mapVideo(v) {
  return {
    id: v.id || null,
    title: v.title || null,
    url: v.url || null,
    duration: typeof v.duration === 'number' ? v.duration : null,
    thumbnail: v.thumbnail_url || null,
    createdAt: typeof v.created_time === 'number' ? new Date(v.created_time * 1000).toISOString() : null,
    views: typeof v.views_total === 'number' ? v.views_total : 0,
    owner: {
      screenname: v['owner.screenname'] || null,
      username: v['owner.username'] || null,
      url: v['owner.url'] || null,
    },
  };
}

export default async function (params) {
  if (!params.url || String(params.url).trim() === '') {
    bizError('MISSING_PARAM', 'url is required: pass a playlist URL (https://www.dailymotion.com/playlist/{id}) or a plain playlist ID');
  }
  const id = extractPlaylistId(params.url);
  if (!id) {
    bizError('INVALID_PARAM', 'url must be a Dailymotion playlist URL (https://www.dailymotion.com/playlist/{id}) or a plain playlist ID');
  }

  let limit = 20;
  if (params.limit !== undefined && params.limit !== null && String(params.limit).trim() !== '') {
    limit = Number.parseInt(String(params.limit), 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      bizError('INVALID_PARAM', `limit must be an integer from 1 to ${MAX_LIMIT}, got "${params.limit}"`);
    }
  }

  // 1. Playlist metadata (videos_total may exceed the 1000-video pagination cap).
  const meta = await apiGet(`${API}/playlist/${id}?fields=${encodeURIComponent(PLAYLIST_FIELDS)}`);

  // 2. Video list, paginated up to the requested limit.
  const videos = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && videos.length < limit && page <= MAX_PAGES) {
    const fetchLimit = Math.min(MAX_LIMIT, limit - videos.length);
    const data = await apiGet(
      `${API}/playlist/${id}/videos?fields=${encodeURIComponent(VIDEO_FIELDS)}&limit=${fetchLimit}&page=${page}`
    );
    const list = Array.isArray(data.list) ? data.list : [];
    for (const v of list) {
      videos.push(mapVideo(v));
      if (videos.length >= limit) break;
    }
    hasMore = data.has_more === true && list.length > 0;
    page += 1;
  }

  const partial = videos.length < limit;

  return {
    id: meta.id || id,
    name: meta.name || null,
    url: `https://www.dailymotion.com/playlist/${id}`,
    description: cleanText(meta.description),
    videosTotal: typeof meta.videos_total === 'number' ? meta.videos_total : null,
    private: meta.private === true,
    owner: {
      id: meta['owner.id'] || null,
      username: meta['owner.username'] || null,
      screenname: meta['owner.screenname'] || null,
      url: meta['owner.url'] || null,
    },
    videos,
    ...(partial ? { partial: true } : {}),
  };
}
