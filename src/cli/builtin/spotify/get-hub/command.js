// spotify/get-hub — fetch the Spotify podcast hub page (/genre/0JQ5DArNBzkmxXHCqFLx2J).
// Re-verified 2026-08-20: the hub currently renders a single "Categories" shelf of category
// cards; no editorial shelves (Episodes You Won't Want to Miss / New Show Releases) and no
// 选择语言 (language) filter are present in the tested market. The command scrolls to trigger
// lazy-loaded content and returns every shelf it finds, adapting to future additions.
// Browser runtime only (anonymous token endpoints are blocked; the page is an app shell).

const HUB_URL = 'https://open.spotify.com/genre/0JQ5DArNBzkmxXHCqFLx2J';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Collect every rendered shelf from the hub page DOM. Runs inside the browser context.
function collectShelvesDom() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const shelves = [];
  document.querySelectorAll('section[data-testid=component-shelf]').forEach((s) => {
    const h = s.querySelector('h2,h3');
    const name = h ? norm(h.innerText) : '';
    if (!name) return;
    // "Show all" link: header row first, then a text-matching link inside the shelf.
    let showAllUrl = '';
    const ha = s.querySelector('[data-testid=rich-title-row-shelf-header] a');
    if (ha) showAllUrl = ha.getAttribute('href') || '';
    if (!showAllUrl) {
      const sa = [...s.querySelectorAll('a')].find((a) => /^(see all|show all|view all|查看所有|全部)/i.test(norm(a.innerText)));
      if (sa) showAllUrl = sa.getAttribute('href') || '';
    }
    const items = [];
    s.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      let kind = null;
      if (href.startsWith('/show/')) kind = 'podcast';
      else if (href.startsWith('/episode/')) kind = 'episode';
      else if (href.startsWith('/genre/')) kind = 'category';
      if (!kind) return;
      const id = href.split('/').pop();
      const img = a.querySelector('img');
      const imgAlt = img ? (img.getAttribute('alt') || '') : '';
      // Constrain to spans INSIDE the anchor (card content), in DOM order; dedupe identical texts
      // (cards often repeat the title in a visually-hidden duplicate span).
      const spans = [...new Set([...a.querySelectorAll('span')].map((x) => norm(x.innerText)).filter(Boolean))];
      const title = norm(a.getAttribute('aria-label')) || spans[0] || norm(imgAlt) || '';
      const subtitle = (spans[1] && spans[1] !== title) ? spans[1] : null;
      // Prefer the resolved/current src; fall back to the raw src attribute and first srcset entry;
      // skip placeholder data:/blob: URIs so lazy-but-present images still yield a real URL.
      let cover = '';
      if (img) {
        const src = img.currentSrc || img.src || img.getAttribute('src') || '';
        const srcset = (img.getAttribute('srcset') || '').split(' ')[0];
        cover = [src, srcset].find((x) => x && !x.startsWith('data:') && !x.startsWith('blob:') && !/placeholder/i.test(x)) || '';
      }
      items.push({ kind, id, url: 'https://open.spotify.com' + href, title, subtitle, cover: cover || null });
    });
    shelves.push({ name, url: showAllUrl ? 'https://open.spotify.com' + showAllUrl : null, items });
  });
  return shelves;
}

// Force card images to settle so covers are populated. Runs inside the browser context.
function settleImagesDom() {
  return new Promise((resolve) => {
    const imgs = [...document.querySelectorAll('section[data-testid=component-shelf] img')];
    if (!imgs.length) { resolve(); return; }
    let remaining = imgs.length;
    const done = () => { remaining -= 1; if (remaining <= 0) resolve(); };
    imgs.forEach((img) => {
      try { img.loading = 'eager'; } catch (e) {}
      if (img.complete && img.currentSrc) { done(); return; }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
    setTimeout(resolve, 3000);
  });
}

// Progressive scroll that reveals lazy-loaded shelves/images on the Spotify web player.
function scrollHubDom() {
  const scroller = document.querySelector('.main-view-container__scroll-node') || document.querySelector('main') || document.scrollingElement;
  const vh = Math.max(scroller.clientHeight || 600, 600);
  scroller.scrollTop = Math.min(scroller.scrollTop + vh * 1.5, scroller.scrollHeight);
  window.scrollTo(0, Math.min(window.scrollY + vh * 1.5, document.body.scrollHeight));
}

// Capture page state for diagnostics when shelves are missing (page structure verification).
function collectPageStateDom() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main');
  return {
    url: location.href,
    title: document.title,
    htmlLang: document.documentElement.lang,
    shelfCount: document.querySelectorAll('section[data-testid=component-shelf]').length,
    entityTitle: (document.querySelector('[data-testid=entityTitle]') || {}).innerText || null,
    h1: norm((document.querySelector('h1') || {}).innerText).slice(0, 80),
    h2s: [...document.querySelectorAll('h2')].map((x) => norm(x.innerText)).filter(Boolean).slice(0, 10),
    mainTextLen: main ? (main.innerText || '').length : 0,
    mainTextHead: main ? norm(main.innerText).slice(0, 300) : null,
    hasLogin: /登录|Log in|Sign in/i.test(document.body ? document.body.innerText : '')
  };
}

const scrollAndSettle = async (page) => {
  for (let i = 0; i < 12; i++) {
    await page.evaluate(scrollHubDom);
    await sleep(300 + Math.random() * 200);
  }
  await page.evaluate(() => {
    const scroller = document.querySelector('.main-view-container__scroll-node') || document.querySelector('main') || document.scrollingElement;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await sleep(700);
  // Settle lazy card images so cover URLs are populated before extraction.
  await page.evaluate(settleImagesDom);
};

export default async (page, params, cwd) => {
  // Spotify occasionally serves a transient "Something went wrong" / empty page (often after rapid
  // repeated loads). Reload-and-retry up to 3 times, spacing attempts to respect polite pacing.
  let shelves = [];
  let lastState = null;
  for (let attempt = 0; attempt < 3 && shelves.length === 0; attempt++) {
    await page.goto(HUB_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForSelector('main', { timeout: 15000 });
    } catch (e) {
      // SPA may take a moment; fall through and scroll below.
    }
    await sleep(2500 + Math.random() * 500);
    await scrollAndSettle(page);

    shelves = await page.evaluate(collectShelvesDom);
    if (shelves.length === 0) {
      lastState = await page.evaluate(collectPageStateDom);
      if (attempt < 2) {
        // Back off before the next reload (polite pacing + transient error handling).
        await sleep(1500 + Math.random() * 800);
      }
    }
  }

  if (shelves.length === 0) {
    const error = new Error('[EMPTY_RESULT] No shelves rendered on the Spotify podcast hub page. Page state: ' + JSON.stringify(lastState));
    error.code = 'EMPTY_RESULT';
    throw error;
  }

  return { shelves, partial: false };
};
