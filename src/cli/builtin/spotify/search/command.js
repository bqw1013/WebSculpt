// spotify/search — search Spotify podcast shows & episodes via the web player's own
// pathfinder GraphQL (searchPodcasts / searchFullEpisodes), re-using the app session.
// Verified 2026-08-20.
// Data path: open the /search/{q}/podcastAndEpisodes page, capture the app's own
// searchPodcasts + searchFullEpisodes responses (offset=0) and their request headers,
// then map the cards and, if --limit exceeds one GraphQL page, re-issue with offset.
const SEARCH_SHA = {
  searchPodcasts: '0195d9f61b43606d490bca64c3456e3593528cea6cc05c7e822c7c42beed0f4e',
  searchFullEpisodes: 'd54e35fafe7520cb53883b86d012911cbad75c14ac079a917951c24cdb07c60f',
};
const TYPES = new Set(['all', 'podcasts', 'episodes']);
const PAGE_SIZE = 30; // app's per-request page size (verified limit=30)
const MAX_LIMIT = 100;

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Dismiss the OneTrust / Spotify consent banner if it appears (blocks app bootstrap).
async function dismissConsent(page) {
  const selectors = ['#onetrust-accept-btn-handler', 'button:has-text("接受")', 'button:has-text("Accept")'];
  for (const sel of selectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await sleep(600);
      return;
    }
  }
}

// Only headers a browser fetch may set and that Spotify's GraphQL needs.
function pickAuthHeaders(raw) {
  const out = {};
  const allowed = ['authorization', 'client-token', 'app-platform', 'spotify-app-version'];
  for (const key of allowed) {
    const v = raw[key];
    if (v) out[key] = v;
  }
  return out;
}

// Pick the 300px cover URL (fallback: largest source).
function pickCover(sources) {
  if (!Array.isArray(sources) || !sources.length) return null;
  const t = sources.find((s) => s.height === 300) || sources[sources.length - 1];
  return t && t.url ? t.url : null;
}

export default async (page, params, cwd) => {
  // ---- parameter validation ----
  const query = String(params.query || '').trim();
  if (!query) fail('MISSING_PARAM', 'query is required (e.g. "joe rogan")');
  const type = String(params.type || 'all');
  if (!TYPES.has(type)) {
    fail('INVALID_PARAM', `type must be one of: all | podcasts | episodes. 中文：all=节目+单集 / podcasts=只节目 / episodes=只单集`);
  }
  if (!/^[1-9][0-9]*$/.test(String(params.limit))) {
    fail('INVALID_PARAM', 'limit must be a positive integer');
  }
  const limit = Number(params.limit);
  if (limit > MAX_LIMIT) fail('INVALID_PARAM', `limit must be <= ${MAX_LIMIT}`);
  const needPods = type === 'all' || type === 'podcasts';
  const needEps = type === 'all' || type === 'episodes';

  // ---- navigate; the app fires searchPodcasts + searchFullEpisodes on load ----
  const searchUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}/podcastAndEpisodes`;

  let authHeaders = null;
  const page0 = { pods: null, eps: null };
  page.on('response', async (resp) => {
    try {
      if (!resp.url().includes('/pathfinder/v2/query')) return;
      const post = resp.request().postData();
      if (!post) return;
      const j = JSON.parse(post);
      const op = j.operationName;
      if (!authHeaders) {
        const h = await resp.request().allHeaders();
        authHeaders = pickAuthHeaders(h);
      }
      if (op === 'searchPodcasts' && !page0.pods) page0.pods = await resp.json();
      if (op === 'searchFullEpisodes' && !page0.eps) page0.eps = await resp.json();
    } catch (e) {
      /* ignore malformed requests */
    }
  });

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await dismissConsent(page);

  // Wait until the app's own GraphQL responses (and auth headers) are captured.
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (authHeaders && (!needPods || page0.pods) && (!needEps || page0.eps)) break;
    await sleep(300);
  }
  if (!authHeaders) fail('DRIFT_DETECTED', 'search GraphQL query did not fire on the search page (consent wall or page changed)');
  if (needPods && !page0.pods) fail('DRIFT_DETECTED', 'searchPodcasts response not captured on the search page');
  if (needEps && !page0.eps) fail('DRIFT_DETECTED', 'searchFullEpisodes response not captured on the search page');

  // ---- map + paginate inside the page context ----
  const out = await page.evaluate(
    async (input) => {
      const { SHA, headers, page0, needPods, needEps, searchTerm, limit, pageSize } = input;
      const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));

      const gql = async (op, variables) => {
        const r = await fetch('https://api-partner.spotify.com/pathfinder/v2/query', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify({
            operationName: op,
            variables,
            extensions: { persistedQuery: { version: 1, sha256Hash: SHA[op] } },
          }),
        });
        return r.json();
      };

      const podsVars = (offset) => ({
        includePreReleases: false,
        includeAlbumPreReleases: false,
        numberOfTopResults: 20,
        searchTerm,
        offset,
        limit: pageSize,
        includeAudiobooks: true,
        includeAuthors: false,
        includeEpisodeContentRatingsV2: true,
      });
      const epsVars = (offset) => ({
        searchTerm,
        offset,
        limit: pageSize,
        includeEpisodeContentRatingsV2: true,
      });

      const pickCover = (srcs) => {
        if (!Array.isArray(srcs) || !srcs.length) return null;
        const t = srcs.find((s) => s.height === 300) || srcs[srcs.length - 1];
        return t && t.url ? t.url : null;
      };

      // Collect up to `limit` items for one GraphQL op. Starts from the app's
      // own offset=0 response, then re-issues with offset when more pages are needed.
      const collect = async (op, varsFor, page0Json) => {
        const bucket = op === 'searchPodcasts' ? 'podcasts' : 'episodes';
        const all = [];
        const seen = new Set();
        const seenKey = (d) => (op === 'searchPodcasts' ? d.uri : d.id || d.uri);
        let totalCount = null;
        let nextOffset = null;
        const pushItems = (items) => {
          for (const d of items) {
            const k = seenKey(d);
            if (k && seen.has(k)) continue; // dedup: app page0 vs re-issue can drift
            if (k) seen.add(k);
            all.push(d);
          }
        };
        if (page0Json && page0Json.data && page0Json.data.searchV2) {
          const c = page0Json.data.searchV2[bucket];
          if (c) {
            totalCount = c.totalCount;
            nextOffset = c.pagingInfo && typeof c.pagingInfo.nextOffset === 'number' ? c.pagingInfo.nextOffset : null;
            const items = (c.items || []).filter(Boolean).map((w) => w.data).filter(Boolean);
            pushItems(items);
          }
        }
        let offset = typeof nextOffset === 'number' ? nextOffset : all.length;
        while (all.length < limit) {
          const j = await gql(op, varsFor(offset));
          const c = j && j.data && j.data.searchV2 && j.data.searchV2[bucket];
          if (!c) {
            const msg = j && j.errors && j.errors[0] ? j.errors[0].message : 'no data';
            const err = new Error(`[GRAPHQL_ERROR] ${op} offset=${offset}: ${msg}`);
            err.code = 'GRAPHQL_ERROR';
            throw err;
          }
          if (totalCount === null) totalCount = c.totalCount;
          const items = (c.items || []).filter(Boolean).map((w) => w.data).filter(Boolean);
          pushItems(items);
          if (items.length < pageSize) break; // exhausted
          const nxt = c.pagingInfo && typeof c.pagingInfo.nextOffset === 'number' ? c.pagingInfo.nextOffset : null;
          offset = typeof nxt === 'number' ? nxt : offset + items.length;
          if (!(offset > 0)) break;
          await sleep2(250 + Math.floor(Math.random() * 300)); // polite pacing
        }
        return { list: all.slice(0, limit), totalCount };
      };

      const result = { query: searchTerm };
      let partial = false;

      if (needPods) {
        const { list, totalCount } = await collect('searchPodcasts', podsVars, page0.pods);
        result.podcasts = list.map((d) => {
          const id = d.uri ? d.uri.split(':').pop() : null;
          return {
            id,
            url: id ? `https://open.spotify.com/show/${id}` : null,
            title: d.name || null,
            publisher: d.publisher && d.publisher.name ? d.publisher.name : null,
            cover: pickCover(d.coverArt && d.coverArt.sources),
          };
        });
        if (list.length < limit) partial = true;
        result.podcastTotalCount = totalCount;
      }

      if (needEps) {
        const { list, totalCount } = await collect('searchFullEpisodes', epsVars, page0.eps);
        result.episodes = list.map((d) => {
          const id = d.id || (d.uri ? d.uri.split(':').pop() : null);
          const show = d.podcastV2 && d.podcastV2.data ? d.podcastV2.data : null;
          const showId = show && show.uri ? show.uri.split(':').pop() : null;
          return {
            id,
            url: id ? `https://open.spotify.com/episode/${id}` : null,
            title: d.name || null,
            show: show
              ? { id: showId, url: showId ? `https://open.spotify.com/show/${showId}` : null, title: show.name || null }
              : null,
            date: d.releaseDate && d.releaseDate.isoString ? d.releaseDate.isoString : null,
            duration: d.duration && typeof d.duration.totalMilliseconds === 'number' ? d.duration.totalMilliseconds : null,
            cover: pickCover(d.coverArt && d.coverArt.sources),
          };
        });
        if (list.length < limit) partial = true;
        result.episodeTotalCount = totalCount;
      }

      result.partial = partial;
      return result;
    },
    {
      SHA: SEARCH_SHA,
      headers: authHeaders,
      page0,
      needPods,
      needEps,
      searchTerm: query,
      limit,
      pageSize: PAGE_SIZE,
    },
  );

  return out;
};
