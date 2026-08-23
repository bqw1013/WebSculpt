// spotify/get-podcast — fetch a Spotify podcast show (open.spotify.com/show/{id}).
//
// Primary path: page-context fetch to Spotify's GraphQL endpoint
//   https://api-partner.spotify.com/pathfinder/v2/query
// using three persisted queries (APQ — Automatic Persisted Queries; the server
// accepts {operationName, variables, extensions:{persistedQuery:{sha256Hash}}}
// without the full query text). The Bearer token is captured fresh from the
// page's own /api/token response (or a pathfinder request header).
//
// Fallback path: best-effort DOM parse of the show page.
//
// Verified 2026-08-20:
//   queryShowMetadataV2        hash 40202837452991ffa80ced96987bc1a937e21d5a89df5bf1fb743110e4d6e93a
//   queryPodcastEpisodes       hash 06046f9b939d56c8eb7cdbb687da938de1164c006871aec91dc26e4dc7d8eb08
//   internalLinkRecommenderShow hash 6c369ff272a666b31fef1629c169925a1bd80f372195396c82304142cacd89e8

const SHA = {
  metadata: '40202837452991ffa80ced96987bc1a937e21d5a89df5bf1fb743110e4d6e93a',
  episodes: '06046f9b939d56c8eb7cdbb687da938de1164c006871aec91dc26e4dc7d8eb08',
  related: '6c369ff272a666b31fef1629c169925a1bd80f372195396c82304142cacd89e8',
};

const PATHFINDER_URL = 'https://api-partner.spotify.com/pathfinder/v2/query';

function commandError(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function parseShowId(rawUrl, rawId) {
  if (rawId && String(rawId).trim()) {
    return String(rawId).trim();
  }
  if (rawUrl && String(rawUrl).trim()) {
    const match = String(rawUrl).trim().match(/\/show\/([A-Za-z0-9]{22})/);
    if (match) return match[1];
  }
  return null;
}

function parseLimit(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 20; // manifest default
  }
  const s = String(raw).trim();
  if (!/^\d{1,3}$/.test(s)) {
    commandError('INVALID_PARAM', `invalid limit "${raw}" — must be an integer between 1 and 100`);
  }
  const value = parseInt(s, 10);
  if (value < 1 || value > 100) {
    commandError('INVALID_PARAM', `invalid limit "${raw}" — must be between 1 and 100`);
  }
  return value;
}

function pickEpisode(ent, data) {
  const id = data.id || (ent._uri || '').split(':').pop() || null;
  const mediaTypes = Array.isArray(data.mediaTypes) ? data.mediaTypes : [];
  const ratingLabels = data.contentRatingsV2 && data.contentRatingsV2.labels;
  return {
    id,
    url: id ? `https://open.spotify.com/episode/${id}` : null,
    title: data.name || null,
    date: data.releaseDate && data.releaseDate.isoString ? data.releaseDate.isoString : null,
    duration: data.duration && data.duration.totalMilliseconds != null ? data.duration.totalMilliseconds : null,
    description: data.description || null,
    explicit: Array.isArray(ratingLabels) && ratingLabels.indexOf('EXPLICIT') !== -1,
    isVideo: mediaTypes.indexOf('VIDEO') !== -1,
    previewUrl:
      data.previewPlayback && data.previewPlayback.audioPreview && data.previewPlayback.audioPreview.cdnUrl
        ? data.previewPlayback.audioPreview.cdnUrl
        : null,
  };
}

function sleep(page, ms) {
  return page.waitForTimeout(ms);
}

export default async (page, params, cwd) => {
  const showId = parseShowId(params.url, params.id);
  if (!showId) {
    commandError('MISSING_PARAM', '--url or --id is required (a Spotify show page URL like https://open.spotify.com/show/{id}, or the 22-character show id)');
  }
  if (!/^[A-Za-z0-9]{22}$/.test(showId)) {
    commandError('INVALID_PARAM', `invalid show id "${showId}" — expected the 22-character id from the /show/ URL segment`);
  }

  const limit = parseLimit(params.limit);
  const includeEpisodes = params.include_episodes !== 'false';
  const includeRelated = params.include_related === 'true';
  const showUrl = `https://open.spotify.com/show/${showId}`;
  const uri = `spotify:show:${showId}`;

  // ---- navigate to the show page and capture a fresh Bearer token ----
  let token = null;
  const onResp = async (resp) => {
    try {
      if (token) return;
      const u = resp.url();
      if (u.indexOf('/api/token') !== -1) {
        const parsed = JSON.parse(await resp.text());
        if (parsed.accessToken) token = parsed.accessToken;
      } else if (u.indexOf('/pathfinder/v2/query') !== -1) {
        const auth = resp.request().headers()['authorization'];
        if (auth && auth.indexOf('Bearer ') === 0) token = auth.slice(7).trim();
      }
    } catch (e) {
      // ignore malformed responses
    }
  };
  page.on('response', onResp);

  try {
    await page.goto(showUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    // navigation timeout is acceptable; the token may still have been captured
  }

  for (let i = 0; i < 30 && !token; i++) {
    await sleep(page, 400);
  }
  page.removeListener('response', onResp);

  // ---- GraphQL replay helper (runs in the page context) ----
  const pathfinder = async (operationName, variables, hash) => {
    const payload = {
      variables,
      operationName,
      extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
    };
    const res = await page.evaluate(
      async ({ payload, token, pathfinderUrl }) => {
        const r = await fetch(pathfinderUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            accept: 'application/json',
            authorization: 'Bearer ' + token,
            'app-platform': 'WebPlayer',
            'spotify-app-version': '1.2.98.238.g8ec0f0a0-development',
          },
          body: JSON.stringify(payload),
        });
        const text = await r.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          parsed = { __rawHead: text.slice(0, 1000) };
        }
        return { status: r.status, parsed };
      },
      { payload, token, pathfinderUrl: PATHFINDER_URL }
    );
    return res;
  };

  // ---- DOM fallback (best effort; primary source is GraphQL) ----
  const domFallback = async () => {
    const dom = await page.evaluate(() => {
      const body = document.body ? document.body.innerText : '';
      const ratingEl = [...document.querySelectorAll('span')].find((s) => /^[0-9]\.[0-9]$/.test(s.innerText));
      const publisherEl = document.querySelector('a[href*="/artist/"]');
      const head = body.slice(0, 1200);
      return {
        head,
        rating: ratingEl ? ratingEl.innerText : null,
        publisher: publisherEl ? publisherEl.innerText.trim() : null,
        hasShowCard: document.querySelectorAll('a[href^="/episode/"]').length > 0,
      };
    }).catch(() => ({ head: '', rating: null, publisher: null, hasShowCard: false }));

    const lines = dom.head
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const title = lines.indexOf('播客') !== -1 ? lines[lines.indexOf('播客') + 1] || null : lines[0] || null;
    const desc = lines.find((s) => s.length > 40) || null;
    if (!dom.hasShowCard && !title) {
      commandError('NOT_FOUND', `show not found (id ${showId})`);
    }
    return {
      id: showId,
      url: showUrl,
      title,
      publisher: dom.publisher,
      description: desc,
      rating: dom.rating ? parseFloat(dom.rating) : null,
      ratingCount: null,
      categories: [],
      explicit: null,
      covers: [],
      totalEpisodes: null,
      episodes: [],
      related: [],
      partial: true,
    };
  };

  if (!token) {
    const fallback = await domFallback();
    return fallback;
  }

  // ---- queryShowMetadataV2 -> metadata ----
  const metaRes = await pathfinder(
    'queryShowMetadataV2',
    { uri, includeContentCapabilityTrait: false, includeEpisodeContentRatingsV2: true },
    SHA.metadata
  );
  await sleep(page, 200 + Math.floor(Math.random() * 300));

  const buildResult = (podcast) => {
    const coverSources = (podcast.coverArt && podcast.coverArt.sources) || [];
    const categoryItems = (podcast.topics && podcast.topics.items) || [];
    const ratingInfo = podcast.rating && podcast.rating.averageRating ? podcast.rating.averageRating : null;
    const explicitLabels = podcast.contentRatingV2 && podcast.contentRatingV2.labels;
    return {
      id: podcast.id || showId,
      url: showUrl,
      title: podcast.name || null,
      publisher: podcast.publisher ? podcast.publisher.name : null,
      description: podcast.description || podcast.htmlDescription || null,
      rating: ratingInfo && ratingInfo.average != null ? ratingInfo.average : null,
      ratingCount: ratingInfo && ratingInfo.totalRatings != null ? ratingInfo.totalRatings : null,
      categories: categoryItems.map((t) => t.title).filter(Boolean),
      explicit: Array.isArray(explicitLabels) && explicitLabels.indexOf('EXPLICIT') !== -1,
      covers: coverSources.map((s) => s.url).filter(Boolean),
      totalEpisodes: null,
      episodes: [],
      related: [],
      partial: false,
    };
  };

  const readPodcast = (res) => (res.parsed && res.parsed.data ? res.parsed.data.podcastUnionV2 : null);
  const metaErrors = metaRes.parsed && metaRes.parsed.errors ? metaRes.parsed.errors : [];

  if (metaRes.status !== 200) {
    // Auth/network problem — fall back to the DOM rather than misreport not-found.
    const fallback = await domFallback();
    return fallback;
  }
  const errorText = metaErrors.map((e) => e.message || '').join(' ');
  let metaRoot = readPodcast(metaRes);
  if (!metaRoot || !metaRoot.id || /not found|not exist|invalid/i.test(errorText)) {
    // A non-existent show id yields an empty podcastUnionV2 (no id/name) or field-level errors.
    commandError('NOT_FOUND', `show not found (id ${showId})`);
  }

  let result = buildResult(metaRoot);
  // Rare server variability: categories (topics) can come back empty on a valid show.
  // Retry the metadata query once when the show clearly exists (has covers) but no categories.
  if (result.categories.length === 0 && result.covers.length > 0) {
    await sleep(page, 300 + Math.floor(Math.random() * 300));
    const metaRetry = await pathfinder(
      'queryShowMetadataV2',
      { uri, includeContentCapabilityTrait: false, includeEpisodeContentRatingsV2: true },
      SHA.metadata
    );
    const retryRoot = readPodcast(metaRetry);
    if (retryRoot && retryRoot.id) {
      result = buildResult(retryRoot);
    }
  }

  // ---- queryPodcastEpisodes -> episode list (offset/limit pagination) ----
  if (includeEpisodes) {
    const episodes = [];
    let totalCount = null;
    let offset = 0;
    const pageSize = Math.min(50, Math.max(1, limit));
    while (episodes.length < limit) {
      const batch = Math.min(pageSize, limit - episodes.length);
      const epRes = await pathfinder(
        'queryPodcastEpisodes',
        { uri, offset, limit: batch, includeEpisodeContentRatingsV2: true },
        SHA.episodes
      );
      const epsV2 = epRes.parsed && epRes.parsed.data ? epRes.parsed.data.podcastUnionV2.episodesV2 : null;
      if (!epsV2) break;
      if (totalCount === null && epsV2.totalCount != null) totalCount = epsV2.totalCount;
      const items = Array.isArray(epsV2.items) ? epsV2.items : [];
      const nextOffset = epsV2.pagingInfo ? epsV2.pagingInfo.nextOffset : null;
      for (const item of items) {
        const ent = item.entity || {};
        const data = ent.data || {};
        if (data.__typename === 'RestrictedContent') continue; // skip the featured/placeholder episode
        if (data.id && data.name) episodes.push(pickEpisode(ent, data));
      }
      if (episodes.length >= limit) break;
      if (nextOffset === null || nextOffset <= offset || items.length === 0) break; // exhausted
      offset = nextOffset;
      await sleep(page, 200 + Math.floor(Math.random() * 500));
    }
    result.episodes = episodes.slice(0, limit);
    result.totalEpisodes = totalCount;
    result.partial = episodes.length < limit;
  }

  // ---- internalLinkRecommenderShow -> related shows ----
  if (includeRelated) {
    const relRes = await pathfinder('internalLinkRecommenderShow', { uri }, SHA.related);
    const recRoot = relRes.parsed && relRes.parsed.data ? relRes.parsed.data.seoRecommendedPodcast : null;
    const relItems = (recRoot && recRoot.items) || [];
    result.related = relItems
      .map((item) => {
        const data = item.data || {};
        const rid = data.id || (data.uri || '').split(':').pop() || null;
        const rCovers = (data.coverArt && data.coverArt.sources) || [];
        return {
          id: rid,
          url: rid ? `https://open.spotify.com/show/${rid}` : null,
          title: data.name || null,
          publisher: data.publisher ? data.publisher.name : null,
          cover: rCovers.length ? rCovers[rCovers.length - 1].url || null : null,
        };
      })
      .filter((r) => r.id);
  }

  return result;
};
