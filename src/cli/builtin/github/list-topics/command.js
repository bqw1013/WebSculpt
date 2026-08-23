// github/list-topics — browser runtime
// Lists GitHub's popular topics from https://github.com/topics.
// The page is SSR and renders a fixed list of 16 featured topics ("All featured topics").
// Extraction scans a[href^="/topics/"] anchors that contain both a p.f3 (title) and a
// p.f5 (description), deduped by href. This covers the featured-row layout
// (a.no-underline.flex-1) and the topic-box layout (div.topic-box) alike.
// The "Popular topics" sidebar chips (a.topic-tag-link) carry no description and rotate
// on every load, so they are intentionally excluded. No login required.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

// Rate awareness: random wait + small random scroll + random mouse move. Best-effort, never fails.
async function humanize(page) {
  try {
    await page.waitForTimeout(200 + Math.floor(Math.random() * 350));
    await page.evaluate(() => {
      window.scrollBy(0, 60 + Math.floor(Math.random() * 200));
    });
    await page.waitForTimeout(120 + Math.floor(Math.random() * 180));
    const vp = page.viewportSize();
    if (vp && vp.width && vp.height) {
      await page.mouse.move(
        Math.floor(Math.random() * vp.width),
        Math.floor(Math.random() * vp.height)
      );
    }
  } catch (e) {
    // Never fail the command because of humanization.
  }
}

// Robust extraction: for each unique /topics/<slug> href, pick the anchor that carries
// both a p.f3 (title) and a p.f5 (description), then build { title, description, url }.
async function extractTopics(page) {
  return page.evaluate(() => {
    const hrefs = [
      ...new Set(
        [...document.querySelectorAll('a[href^="/topics/"]')].map((a) => a.getAttribute('href'))
      )
    ];
    const items = [];
    for (const href of hrefs) {
      const anchor = [...document.querySelectorAll(`a[href="${href}"]`)].find((a) => {
        const t = a.querySelector('p.f3');
        const d = a.querySelector('p.f5');
        return t && d;
      });
      if (!anchor) continue;
      const title = anchor.querySelector('p.f3').textContent.trim();
      const desc = anchor.querySelector('p.f5').textContent.trim();
      if (title) {
        items.push({ title, description: desc, url: 'https://github.com' + href });
      }
    }
    return items;
  });
}

export default async (page, params, cwd) => {
  // ---- Parameter validation (before any page access) ----
  let limit = DEFAULT_LIMIT;
  if (params.limit !== undefined && params.limit !== null && String(params.limit).trim() !== '') {
    limit = parseInt(String(params.limit).trim(), 10);
    if (Number.isNaN(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw makeError('INVALID_PARAM', `limit must be an integer between 1 and ${MAX_LIMIT}.`);
    }
  }

  // ---- Navigate ----
  try {
    await page.goto('https://github.com/topics', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    throw makeError('NETWORK_ERROR', `Failed to load https://github.com/topics: ${e.message}`);
  }
  await humanize(page);

  // Wait for a topic card anchor to be present before extracting (avoids grabbing the page
  // before the featured topics render). Times out silently and falls through to extraction.
  await page
    .waitForSelector('a[href^="/topics/"]', { timeout: 20000 })
    .catch(() => {});

  const items = await extractTopics(page);

  if (items.length === 0) {
    throw makeError(
      'EMPTY_RESULT',
      'No topic cards found on https://github.com/topics. The page structure may have changed or access may be blocked.'
    );
  }

  // limit truncates the fixed featured list (page renders 16; default 20 returns all 16).
  return items.slice(0, limit);
};
