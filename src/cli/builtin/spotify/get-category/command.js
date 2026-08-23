// spotify/get-category — fetch a Spotify podcast category page (/genre/{id}).
// Returns the category name, the theme playlist shelves, and the 热门{类别}播客
// top-shows section (show cards: id/url/title/publisher/cover), scrolling the page
// internally to load more shows up to --limit (max 100).
// Browser runtime only: anonymous token endpoints and pathfinder are blocked
// (verified 403/400/401), so data is read through the page DOM reusing the app session.
// Verified 2026-08-20.

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const MAX_SCROLLS = 30;

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- browser-context helpers (run inside page.evaluate) ----

// Extract every rendered shelf from the category page DOM. Cards are read from the
// card container (div[data-encore-id="card"]) which wraps the anchor, title/subtitle
// spans and cover image; this matches the verified card structure.
// Two passes: (1) section-based shelves; (2) global card scan grouped by the nearest
// preceding h2, which picks up theme shelves that are not wrapped in a <section>.
function collectShelvesDom() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const shelves = [];
  const seenNames = new Set();
  const seenCards = new Set();

  const readCard = (card) => {
    const a = card.querySelector('a[href^="/show/"], a[href^="/playlist/"], a[href^="/episode/"], a[href^="/genre/"]');
    if (!a) return null;
    const href = a.getAttribute('href') || '';
    const m = href.match(/^\/(show|playlist|episode|genre)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    const id = m[2];
    if (seenCards.has(id)) return null;
    seenCards.add(id);
    const titleEl = card.querySelector('[id^="card-title-"]');
    const subEl = card.querySelector('[id^="card-subtitle-"]');
    const img = card.querySelector('img[data-testid="card-image"], img');
    let cover = '';
    if (img) {
      const src = img.currentSrc || img.src || img.getAttribute('src') || '';
      const srcset = (img.getAttribute('srcset') || '').split(' ')[0];
      cover = [src, srcset].find((x) => x && !x.startsWith('data:') && !x.startsWith('blob:')) || '';
    }
    return {
      id,
      url: 'https://open.spotify.com' + href.split(/[?#]/)[0],
      title: norm(titleEl ? titleEl.innerText : '') || norm(a.getAttribute('aria-label')) || null,
      publisher: subEl ? norm(subEl.innerText) || null : null,
      cover: cover || null,
    };
  };

  // Pass 1: section-based shelves (h2 + cards inside a <section>).
  document.querySelectorAll('section').forEach((sec) => {
    const h = sec.querySelector('h2,h3');
    const name = h ? norm(h.innerText) : '';
    if (!name || seenNames.has(name)) return;
    const cards = [];
    sec.querySelectorAll('div[data-encore-id="card"]').forEach((card) => {
      const item = readCard(card);
      if (item) cards.push(item);
    });
    if (!cards.length) return;
    const showCount = cards.filter((c) => c.url.indexOf('/show/') !== -1).length;
    const playlistCount = cards.filter((c) => c.url.indexOf('/playlist/') !== -1).length;
    seenNames.add(name);
    shelves.push({ name, kind: showCount > playlistCount ? 'show' : 'playlist', shows: cards });
  });

  // Pass 2: global card scan grouped by nearest preceding h2 (theme shelves are often
  // not wrapped in <section>, so this catches cards Pass 1 could not see).
  const h2s = [...document.querySelectorAll('h2,h3')]
    .map((h) => ({ el: h, name: norm(h.innerText) }))
    .filter((x) => x.name);
  document.querySelectorAll('div[data-encore-id="card"]').forEach((card) => {
    const item = readCard(card);
    if (!item) return;
    let name = null;
    for (const h of h2s) {
      if (card.compareDocumentPosition(h.el) & Node.DOCUMENT_POSITION_PRECEDING) {
        name = h.name; // h.el precedes the card -> nearest preceding h2 so far
      } else {
        break; // h2s are in document order; first non-preceding ends the search
      }
    }
    if (!name) return;
    let shelf = shelves.find((s) => s.name === name);
    if (!shelf) {
      shelf = { name, kind: item.url.indexOf('/show/') !== -1 ? 'show' : 'playlist', shows: [] };
      seenNames.add(name);
      shelves.push(shelf);
    }
    shelf.shows.push(item);
  });

  return shelves;
}

function settleImagesDom() {
  return new Promise((resolve) => {
    const imgs = [...document.querySelectorAll('img[data-testid="card-image"]')];
    if (!imgs.length) { resolve(); return; }
    let remaining = imgs.length;
    const done = () => { remaining -= 1; if (remaining <= 0) resolve(); };
    imgs.forEach((img) => {
      try { img.loading = 'eager'; } catch (e) {}
      if (img.complete && img.currentSrc) { done(); return; }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
    setTimeout(resolve, 2500);
  });
}

function scrollPageDom() {
  const scroller = document.querySelector('.main-view-container__scroll-node') || document.querySelector('main') || document.scrollingElement;
  const vh = Math.max(scroller.clientHeight || 600, 600);
  scroller.scrollTop = Math.min(scroller.scrollTop + vh * 1.6, scroller.scrollHeight);
  window.scrollTo(0, Math.min(window.scrollY + vh * 1.6, document.body.scrollHeight));
}

function scrollToTopDom() {
  const scroller = document.querySelector('.main-view-container__scroll-node') || document.querySelector('main') || document.scrollingElement;
  scroller.scrollTop = 0;
  window.scrollTo(0, 0);
}

function collectPageStateDom() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const categoryH1El = document.querySelector('h1[class*="encore-text-headline-large"]');
  const main = document.querySelector('main');
  return {
    url: location.href,
    title: document.title,
    categoryH1: categoryH1El ? norm(categoryH1El.innerText) : null,
    h1s: [...document.querySelectorAll('h1')].map((x) => norm(x.innerText)).filter(Boolean).slice(0, 6),
    h2s: [...document.querySelectorAll('h2')].map((x) => norm(x.innerText)).filter(Boolean).slice(0, 12),
    sectionCount: document.querySelectorAll('section').length,
    cardCount: document.querySelectorAll('div[data-encore-id="card"]').length,
    mainTextLen: main ? (main.innerText || '').length : 0,
  };
}

async function dismissConsent(page) {
  const selectors = ['#onetrust-accept-btn-handler', 'button:has-text("接受")', 'button:has-text("Accept")'];
  for (const sel of selectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await sleep(500);
      return;
    }
  }
}

// ---- node-side merge helpers ----

function mergeShelfInto(map, freshShelf) {
  const existing = map[freshShelf.name];
  if (!existing) {
    map[freshShelf.name] = { name: freshShelf.name, kind: freshShelf.kind, shows: freshShelf.shows.slice() };
    return;
  }
  if (existing.kind !== 'show' && freshShelf.kind === 'show') existing.kind = 'show';
  const seen = new Set(existing.shows.map((x) => x.id));
  for (const item of freshShelf.shows) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      existing.shows.push(item);
    }
  }
}

// ---- main ----

export default async (page, params, cwd) => {
  // ---- parameter validation (numeric params: regex on raw string, no parseInt truncation) ----
  const rawUrl = String(params.url || '').trim();
  const genreId = String(params.genre_id || '').trim();
  let targetId = null;
  if (genreId) {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(genreId)) {
      fail('INVALID_PARAM', 'genre_id looks invalid (expected an opaque genre id like 0JQ5DAqbMKFNr6gDrHHVKL)');
    }
    targetId = genreId;
  } else if (rawUrl) {
    const m = rawUrl.match(/\/genre\/([A-Za-z0-9_-]+)/);
    if (!m) fail('INVALID_PARAM', 'url must contain /genre/{id} (e.g. https://open.spotify.com/genre/0JQ5DAqbMKFNr6gDrHHVKL)');
    targetId = m[1];
  } else {
    fail('MISSING_PARAM', 'either --genre-id or --url is required. 中文：--genre-id 或 --url 必填其一（genre_id 来自 spotify/list-categories 输出的 genreId 字段）');
  }
  const limitRaw = String(params.limit == null ? DEFAULT_LIMIT : params.limit).trim();
  if (!/^[1-9][0-9]*$/.test(limitRaw)) {
    fail('INVALID_PARAM', 'limit must be a positive integer 1-100 (default 20). 中文：limit 必须是 1-100 的整数，默认 20');
  }
  const limit = Number(limitRaw);
  if (limit > MAX_LIMIT) fail('INVALID_PARAM', `limit must be <= ${MAX_LIMIT} (default 20). 中文：limit 最大 100`);

  const targetUrl = `https://open.spotify.com/genre/${targetId}`;

  // ---- navigate + initial extraction (retry on transient blank / "Something went wrong" page) ----
  let shelves = [];
  let lastState = null;
  for (let attempt = 0; attempt < 3 && shelves.length === 0; attempt++) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await dismissConsent(page);
    try {
      await page.waitForSelector('main', { timeout: 20000 });
    } catch (e) {
      // SPA may render without <main>; fall through and scroll below.
    }
    await sleep(3000 + Math.random() * 600);
    await page.evaluate(scrollToTopDom);
    await sleep(400 + Math.random() * 200);
    await page.evaluate(settleImagesDom);
    shelves = await page.evaluate(collectShelvesDom);
    if (shelves.length === 0) {
      lastState = await page.evaluate(collectPageStateDom);
      if (attempt < 2) {
        // Spotify's transient "Something went wrong" page: wait longer before the next reload.
        const sawError = lastState && (/something went wrong/i.test(lastState.title) || (lastState.h1s || []).some((h) => /something went wrong/i.test(h)));
        await sleep(sawError ? 8000 + Math.random() * 2000 : 2500 + Math.random() * 1200);
      }
    }
  }

  if (shelves.length === 0) {
    const error = new Error('[EMPTY_RESULT] No category shelves rendered on the Spotify genre page. Page state: ' + JSON.stringify(lastState));
    error.code = 'EMPTY_RESULT';
    throw error;
  }

  // ---- category name ----
  let categoryName = null;
  try {
    categoryName = await page.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const e = document.querySelector('h1[class*="encore-text-headline-large"]');
      return e ? norm(e.innerText) : null;
    });
  } catch (e) {
    /* keep null */
  }
  if (!categoryName) categoryName = shelves[0] ? shelves[0].name : targetId;

  // ---- merge initial shelves into a map, then scroll to load more shows ----
  const shelfMap = {};
  for (const s of shelves) mergeShelfInto(shelfMap, s);

  const showShelfName = (Object.values(shelfMap).find((s) => s.kind === 'show') || {}).name || null;
  let prevShowCount = Object.values(shelfMap)
    .filter((s) => s.kind === 'show')
    .reduce((n, s) => n + s.shows.length, 0);
  let scrolls = 0;
  let exhausted = false;

  while (prevShowCount < limit && scrolls < MAX_SCROLLS && !exhausted) {
    await page.evaluate(scrollPageDom);
    scrolls += 1;
    await sleep(400 + Math.random() * 350);
    await page.evaluate(settleImagesDom);
    const fresh = await page.evaluate(collectShelvesDom);
    let added = 0;
    for (const s of fresh) {
      const before = (shelfMap[s.name] ? shelfMap[s.name].shows.length : 0);
      mergeShelfInto(shelfMap, s);
      added += (shelfMap[s.name].shows.length - before);
    }
    const showCount = Object.values(shelfMap)
      .filter((s) => s.kind === 'show')
      .reduce((n, s) => n + s.shows.length, 0);
    if (scrolls > 0 && showCount === prevShowCount && added === 0) exhausted = true;
    prevShowCount = showCount;
  }

  // ---- build output ----
  // --limit applies to the 热门{类别}播客 show shelf; theme playlist shelves are returned in full.
  const shelvesOut = Object.values(shelfMap).map((s) => ({
    name: s.name,
    shows: s.kind === 'show' ? s.shows.slice(0, limit) : s.shows,
  }));
  const finalShowCount = Object.values(shelfMap)
    .filter((s) => s.kind === 'show')
    .reduce((n, s) => n + s.shows.length, 0);
  const partial = finalShowCount < limit;

  return {
    genreId: targetId,
    name: categoryName,
    shelves: shelvesOut,
    partial,
  };
};
