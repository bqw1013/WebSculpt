// spotify/get-podcast-chart — fetch Spotify's in-app podcast chart (播客排行榜).
//
// The chart page (open.spotify.com/genre/0JQ5DAB3zgCauRwnvdEQjJ) is a fixed top-20
// ranked list of podcast shows. All data arrives via the page's own pathfinder
// GraphQL calls (`browsePage` / `browseSection`); the HTML is an empty SPA shell.
//
// The chart is account/market-gated: a logged-in account (e.g. a free account in the
// HK market) gets an EMPTY section (`items: []`, totalCount 0). It only renders fully
// in an anonymous browsing session. We therefore open a fresh incognito context
// inside the attached browser, read the pathfinder response off that anonymous page,
// and close the context immediately (open-and-close-fast: the window appears only
// briefly). DOM parsing (`a[href*="/show/"]`) is the fallback.
//
// NOTE on limits: `browsePage` only returns 10 section items (`sectionPagination
// limit 10`); the full 20 come from `browseSection` (`pagination limit 20`), so we
// wait for browseSection first.
//
// Rank is not an explicit field: it is the array position (index + 1). No pagination,
// no filters, no parameters.

const CHART_URL = 'https://open.spotify.com/genre/0JQ5DAB3zgCauRwnvdEQjJ';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter() {
  return 200 + Math.floor(Math.random() * 500); // 200-700ms polite pacing
}

function pickCover(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  let best = null;
  for (const s of sources) {
    if (!s || !s.url) continue;
    if (!best || (s.height || 0) > (best.height || 0)) best = s;
  }
  return best ? best.url : null;
}

function normalizeItem(item, rank) {
  const content = item && item.content ? item.content : item;
  const data = content && content.data ? content.data : content;
  const uri = (item && item.uri) || (data && data.uri) || '';
  const id = String(uri).replace('spotify:show:', '');
  return {
    rank,
    id,
    url: `https://open.spotify.com/show/${id}`,
    title: (data && data.name) || null,
    publisher: (data && data.publisher && data.publisher.name) || null,
    cover: data && data.coverArt ? pickCover(data.coverArt.sources) : null,
  };
}

// Extract entries from a browsePage/browseSection GraphQL response JSON.
// Returns null if the response has no browse data.
function extractFromJson(json) {
  if (!json || !json.data) return null;
  if (json.data.browseSection) {
    const si = json.data.browseSection.sectionItems || {};
    const items = si.items || [];
    return items.map((it, i) => normalizeItem(it, i + 1));
  }
  if (json.data.browse) {
    const sections = json.data.browse.sections || {};
    const items = [];
    for (const s of sections.items || []) {
      for (const it of (s.sectionItems && s.sectionItems.items) || []) items.push(it);
    }
    return items.map((it, i) => normalizeItem(it, i + 1));
  }
  return null;
}

function browseRespPredicate(wantSection) {
  return (resp) => {
    if (!resp.url().includes('/pathfinder/')) return false;
    const pd = (resp.request() && resp.request().postData()) || '';
    return wantSection ? pd.includes('browseSection') : pd.includes('browsePage') || pd.includes('browseSection');
  };
}

export default async (page) => {
  await sleep(jitter());

  let browser = null;
  try {
    browser = page.context().browser();
  } catch (e) {
    browser = null;
  }
  if (!browser) {
    const err = new Error('[DRIFT_DETECTED] No browser handle available to open an anonymous context for the chart');
    err.code = 'DRIFT_DETECTED';
    throw err;
  }

  const ctx = await browser.newContext();
  const chartPage = await ctx.newPage();
  try {
    // Primary: browseSection (pagination limit 20 → full 20-item chart).
    const sectionResp = chartPage.waitForResponse(browseRespPredicate(true), { timeout: 10000 });
    await chartPage.goto(CHART_URL, { waitUntil: 'domcontentloaded' });

    let entries = null;
    try {
      const resp = await sectionResp;
      entries = extractFromJson(await resp.json());
    } catch (e) {
      entries = null;
    }

    // Fallback 1: browsePage (only 10 items, incomplete but better than nothing).
    if (!entries || entries.length === 0) {
      try {
        const resp2 = await chartPage.waitForResponse(browseRespPredicate(false), { timeout: 5000 });
        entries = extractFromJson(await resp2.json());
      } catch (e) {
        /* keep entries as-is */
      }
    }

    // Fallback 2: DOM cards (20 anchors in the anonymous render).
    if (!entries || entries.length === 0) {
      const anchors = await chartPage.$$('a[href*="/show/"]');
      entries = await chartPage.evaluate((handles) => {
        const seen = new Set();
        const out = [];
        for (const a of handles) {
          const href = a.getAttribute('href') || '';
          const id = href.split('/show/')[1] || '';
          if (!id || seen.has(id)) continue;
          seen.add(id);
          let card = a;
          for (let i = 0; i < 5 && card && card !== document.body; i++) {
            const tid = card.getAttribute && card.getAttribute('data-testid');
            if (tid && /card|grid/i.test(tid)) break;
            card = card.parentElement;
          }
          const text = (card ? card.innerText : a.innerText) || '';
          const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
          const img = (card || a).querySelector('img');
          out.push({
            rank: out.length + 1,
            id,
            url: `https://open.spotify.com/show/${id}`,
            title: lines[0] || null,
            publisher: lines[1] || null,
            cover: img ? img.src : null,
          });
        }
        return out.slice(0, 20);
      }, anchors);
    }

    // Dedupe by id, cap at 20, renumber ranks in list order.
    const seenIds = new Set();
    const final = [];
    for (const e of entries || []) {
      if (!e.id || seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      final.push(e);
      if (final.length >= 20) break;
    }
    final.forEach((e, i) => {
      e.rank = i + 1;
    });

    return { entries: final };
  } finally {
    await chartPage.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
};
