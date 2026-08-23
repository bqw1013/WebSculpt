// huggingface/list-spaces — list HF Spaces with sdk/search/author filters.
// Browser runtime: reuse the user's Chrome network. sdk filter uses the
// /spaces?sdk= page (the /api/spaces list API ignores the sdk param); search and
// author use the internal /api/spaces list API.

const SDK_VALUES = ['gradio', 'streamlit', 'static', 'docker'];
const PAGE_SIZE = 24; // verified: /spaces SSR renders 24 article cards per page

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bizError(code, message) {
  const err = new Error('[' + code + '] ' + message);
  err.code = code;
  return err;
}

export default async (page, params, cwd) => {
  // --- parameter validation (before any network call) ---
  // limit must be a plain decimal integer string (no parseInt coercion of "1.5"/"1e3"/"2abc").
  // Validate the raw string first, then the 1-100 range.
  const rawLimit = String(params.limit ?? '');
  if (!/^\d+$/.test(rawLimit)) {
    throw bizError('INVALID_PARAM', 'limit must be a positive integer between 1 and 100, got: "' + params.limit + '"');
  }
  const limit = Number(rawLimit);
  if (limit < 1 || limit > 100) {
    throw bizError('INVALID_PARAM', 'limit must be an integer between 1 and 100, got: ' + params.limit);
  }

  const sdk = (params.sdk || '').trim();
  if (sdk && !SDK_VALUES.includes(sdk)) {
    throw bizError('INVALID_PARAM', 'Invalid sdk: ' + sdk + '. Accepted: ' + SDK_VALUES.join(' | '));
  }

  const search = (params.search || '').trim();
  const author = (params.author || '').trim();

  // --- polite pacing: light random mouse movement, scroll, and wait ---
  const gentle = async (waitMs) => {
    await page.mouse.move(randInt(60, 320), randInt(120, 600));
    await page.mouse.move(randInt(340, 780), randInt(180, 540));
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(Math.random() * 320));
    });
    await sleep(randInt(waitMs, waitMs + 400));
  };

  const toItem = (base) => ({
    id: base.id,
    url: 'https://huggingface.co/spaces/' + base.id,
    likes: base.likes != null ? base.likes : 0,
    sdk: base.sdk || null,
    author: base.author || null,
    createdAt: base.createdAt || null,
    tags: Array.isArray(base.tags) ? base.tags : [],
    trendingScore: base.trendingScore != null ? base.trendingScore : null,
    lastModified: base.lastModified || null,
    description: base.description != null ? base.description : null,
    title: base.title != null ? base.title : null
  });

  if (sdk && !author) {
    // ============ PATH 1: sdk filter (sdk [+ search]) ============
    // The /api/spaces list API ignores the sdk param, but every item carries its
    // `sdk` field. Only /spaces?sdk= SSR pages filter by sdk, so this path ALWAYS
    // uses the pages as the base and enriches them from the API top-100 where ids
    // overlap. The output field set is therefore deterministic regardless of limit:
    //   - page fields (title/description/lastModified/author/likes) are always present;
    //   - API fields (createdAt/tags/trendingScore/sdk) are filled for spaces that
    //     appear in the API top-100 and null otherwise (e.g. most streamlit spaces).
    // The old "fast path" (API-only when the top-100 provided enough) silently
    // returned null title/description/lastModified and switched schema at an
    // invisible threshold; it is removed in favor of this uniform merge.
    await page.goto('https://huggingface.co/api/spaces?limit=1', { waitUntil: 'domcontentloaded' });
    await gentle(350);

    // (a) API top-100 (search-aware) — used to enrich page cards and as a graceful
    // fallback when the page source fails.
    const apiData = await page.evaluate(async (search) => {
      let q = '/api/spaces?limit=100';
      if (search) q += '&search=' + encodeURIComponent(search);
      const res = await fetch(q, { headers: { accept: 'application/json' } });
      if (!res.ok) return { error: 'HTTP ' + res.status };
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        return { error: 'JSON parse failed' };
      }
      return { items: Array.isArray(body) ? body : body.items || [] };
    }, search);
    if (apiData.error) {
      throw bizError('NETWORK_ERROR', 'Failed to fetch /api/spaces: ' + apiData.error);
    }
    const apiFiltered = apiData.items.filter((x) => x.sdk === sdk);

    // (b) Fetch /spaces?sdk= SSR pages (0..N) concurrently. Each page result carries
    // its HTTP status (0 = network failure) so the command can classify errors below.
    const pagesNeeded = Math.max(1, Math.ceil(limit / PAGE_SIZE));
    const pageResults = await page.evaluate(
      (arg) =>
        (async () => {
          const sdk = arg.sdk;
          const search = arg.search;
          const pagesNeeded = arg.pagesNeeded;
          const pageResults = await Promise.all(
            Array.from({ length: pagesNeeded }, (_, p) =>
              (async () => {
                if (p > 0) {
                  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180));
                }
                let q = '/spaces?sdk=' + encodeURIComponent(sdk) + '&p=' + p;
                if (search) q += '&search=' + encodeURIComponent(search);
                let res;
                try {
                  res = await fetch(q, { headers: { accept: 'text/html' } });
                } catch (err) {
                  return { status: 0, cards: [], error: String(err) };
                }
                if (res.status !== 200) return { status: res.status, cards: [] };
                const html = await res.text();
                const s = html.indexOf('<article');
                const e = html.lastIndexOf('</article>');
                const slice = s >= 0 && e > s ? html.slice(s, e + 10) : html;
                const doc = new DOMParser().parseFromString(slice, 'text/html');
                const out = [];
                const articles = Array.from(doc.querySelectorAll('article'));
                for (const a of articles) {
                  const aEl = a.querySelector('a[href^="/spaces/"]');
                  if (!aEl) continue;
                  const href = aEl.getAttribute('href');
                  if (!href || !/^\/spaces\/[^/]+\/[^/]+$/.test(href)) continue;
                  const id = href.slice('/spaces/'.length);
                  const h4 = a.querySelector('h4');
                  const footerBtn = a.querySelector('footer button');
                  const timeEl = a.querySelector('footer time');
                  const desc = a.querySelector('main p');
                  let likes = 0;
                  const header = a.querySelector('header');
                  if (header) {
                    const spans = Array.from(header.querySelectorAll('span'));
                    for (const s of spans) {
                      const t = s.textContent.trim();
                      if (/^\d{1,6}$/.test(t)) { likes = parseInt(t, 10); break; }
                    }
                  }
                  out.push({
                    id: id,
                    author: footerBtn ? footerBtn.textContent.trim() : id.split('/')[0],
                    likes: likes,
                    lastModified: timeEl ? timeEl.getAttribute('datetime') : null,
                    description: desc ? desc.textContent.trim() : '',
                    title: h4 ? h4.textContent.trim() : ''
                  });
                }
                return { status: 200, cards: out };
              })()
            )
          );
          return pageResults;
        })(),
      { sdk: sdk, search: search, pagesNeeded: pagesNeeded }
    );

    // (c) Classify page errors:
    //   HTTP 400        -> sdk value rejected -> INVALID_PARAM
    //   HTTP 429        -> rate limited       -> RATE_LIMITED
    //   HTTP 5xx / 403 / network (status 0)   -> NETWORK_ERROR
    // If the page source fails but the API top-100 already provides enough items,
    // degrade gracefully to the API-only result instead of surfacing the page error.
    const page400 = pageResults.find((r) => r.status === 400);
    const page429 = pageResults.find((r) => r.status === 429);
    const pageNet = pageResults.find((r) => r.status === 0);
    const pageBad = pageResults.find((r) => r.status !== 200 && r.status !== 400 && r.status !== 429);
    if (page400) {
      throw bizError('INVALID_PARAM', "sdk value '" + sdk + "' rejected by Hugging Face (HTTP 400). Accepted: " + SDK_VALUES.join(' | '));
    }
    if (pageNet || page429 || pageBad) {
      if (apiFiltered.length >= limit) {
        const items = apiFiltered.slice(0, limit).map((it) =>
          toItem({
            id: it.id,
            author: typeof it.id === 'string' && it.id.includes('/') ? it.id.split('/')[0] : null,
            likes: it.likes,
            sdk: it.sdk,
            createdAt: it.createdAt,
            tags: it.tags,
            trendingScore: it.trendingScore,
            lastModified: null,
            description: null,
            title: null
          })
        );
        return {
          items,
          count: items.length,
          filters: { sdk, search: search || null, author: author || null }
        };
      }
      if (page429) {
        throw bizError('RATE_LIMITED', 'Hugging Face rate-limited the /spaces?sdk= request (HTTP 429). Try again later.');
      }
      const detail = pageNet ? 'network failure' : 'HTTP ' + pageBad.status;
      throw bizError('NETWORK_ERROR', 'Failed to fetch /spaces?sdk= pages (' + detail + ')');
    }

    // (d) Merge: page order first (sdk-relevant ranking), enriched by API fields
    // where ids overlap; then append API-filtered ids not seen, up to limit.
    let cards = [].concat(...pageResults.map((r) => r.cards));
    if (search) {
      // /spaces?sdk= may ignore the search param; filter client-side so the
      // sdk+search combination only returns matching spaces regardless of page behavior.
      const needle = search.toLowerCase();
      cards = cards.filter(
        (c) =>
          (c.id || '').toLowerCase().includes(needle) ||
          (c.title || '').toLowerCase().includes(needle) ||
          (c.description || '').toLowerCase().includes(needle)
      );
    }
    const apiMap = {};
    for (const x of apiFiltered) {
      apiMap[x.id] = x;
    }
    const seen = new Set();
    const merged = [];
    for (const c of cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const a = apiMap[c.id] || {};
      merged.push(
        toItem({
          id: c.id,
          author: c.author,
          likes: a.likes != null ? a.likes : c.likes,
          sdk: a.sdk || sdk,
          createdAt: a.createdAt,
          tags: a.tags,
          trendingScore: a.trendingScore,
          lastModified: c.lastModified,
          description: c.description,
          title: c.title
        })
      );
    }
    if (merged.length < limit) {
      for (const x of apiFiltered) {
        if (seen.has(x.id)) continue;
        seen.add(x.id);
        merged.push(
          toItem({
            id: x.id,
            author: typeof x.id === 'string' && x.id.includes('/') ? x.id.split('/')[0] : null,
            likes: x.likes,
            sdk: x.sdk,
            createdAt: x.createdAt,
            tags: x.tags,
            trendingScore: x.trendingScore,
            lastModified: null,
            description: null,
            title: null
          })
        );
        if (merged.length >= limit) break;
      }
    }

    if (merged.length === 0) {
      throw bizError('EMPTY_RESULT', 'No Spaces found for sdk=' + sdk + (search ? '&search=' + search : ''));
    }

    const items = merged.slice(0, limit);
    return {
      items,
      count: items.length,
      filters: { sdk, search: search || null, author: author || null }
    };
  }

  // ============ PATH 2: API list (search/author work here; sdk not supported by API) ============
  await page.goto('https://huggingface.co/spaces', { waitUntil: 'domcontentloaded' });
  await gentle(500);

  const result = await page.evaluate(async (arg) => {
    const search = arg.search;
    const author = arg.author;
    let q = '/api/spaces?limit=100';
    if (search) q += '&search=' + encodeURIComponent(search);
    if (author) q += '&author=' + encodeURIComponent(author);
    const res = await fetch(q, { headers: { accept: 'application/json' } });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      return { error: 'JSON parse failed', status: res.status };
    }
    if (!res.ok) {
      const msg = body && body.error ? body.error : 'HTTP ' + res.status;
      return { error: msg, status: res.status };
    }
    return { items: Array.isArray(body) ? body : [], status: res.status };
  }, { search: search, author: author });

  if (result.error) {
    throw bizError('NETWORK_ERROR', result.error + ' (HTTP ' + result.status + ')');
  }

  let filtered = result.items;
  if (sdk) filtered = filtered.filter((x) => x.sdk === sdk); // sdk+author combo: author narrows, then filter by sdk field

  if (filtered.length === 0) {
    throw bizError('EMPTY_RESULT', 'No Spaces found for the given filters' + (sdk ? ' (sdk=' + sdk + ')' : ''));
  }

  const items = filtered.slice(0, limit).map((it) =>
    toItem({
      id: it.id,
      author: typeof it.id === 'string' && it.id.includes('/') ? it.id.split('/')[0] : null,
      likes: it.likes,
      sdk: it.sdk,
      createdAt: it.createdAt,
      tags: it.tags,
      trendingScore: it.trendingScore,
      lastModified: null,
      description: null,
      title: null
    })
  );

  return {
    items,
    count: items.length,
    filters: { sdk: sdk || null, search: search || null, author: author || null }
  };
};
