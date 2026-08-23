// quora/get-space - fetch metadata and one view of a Quora Space.
// Runtime: browser. Uses stable Quora test-class selectors discovered in explore.

const SECTIONS = ['posts', 'questions', 'about', 'contributors'];
const SORTS = ['top', 'recent'];

// Small async sleep wrapper for Playwright page timeouts.
function wait(page, ms) {
  return page.waitForTimeout(ms);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Simulate human-like pauses, mouse movement and small scrolls.
async function humanPause(page) {
  const viewport = page.viewportSize() || { width: 1280, height: 800 };
  const x = randomInt(120, Math.max(130, viewport.width - 20));
  const y = randomInt(120, Math.max(130, viewport.height - 20));
  await page.mouse.move(x, y);
  await wait(page, randomInt(150, 450));
}

async function humanScroll(page, times = 3) {
  for (let i = 0; i < times; i++) {
    await page.evaluate((dy) => window.scrollBy(0, dy), randomInt(250, 550));
    await wait(page, randomInt(400, 800));
  }
}

// Build the Space URL from params. Tabs are query parameters, not path segments.
function buildUrl(params) {
  const space = params.space;
  const section = params.section;
  const sort = params.sort;

  let url = `https://${space}.quora.com/`;
  const query = [];

  if (section === 'questions') {
    query.push('questions');
  } else if (section === 'about' || section === 'contributors') {
    query.push('about');
  } else if (section === 'posts' && sort === 'recent') {
    query.push('sort=recent');
  }

  if (query.length) {
    url += '?' + query.join('&');
  }
  return url;
}

// Throw a structured business error.
function fail(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  throw err;
}

// Extract Space header metadata using stable selectors.
async function extractMeta(page) {
  return page.evaluate(() => {
    const nameEl = document.querySelector('.puppeteer_test_tribe_name');
    const headerEl = document.querySelector('.puppeteer_test_tribe_info_header');
    const name = (nameEl && nameEl.innerText.trim()) || '';
    const headerText = (headerEl && headerEl.innerText) || '';
    const lines = headerText.split('\n').map(l => l.trim()).filter(Boolean);
    const description = lines[1] || null;

    // Unicode-digit aware counts (handles localized numerals like Devanagari).
    const numRe = '([\\p{Nd},.]+[KMB]?)';
    const contributorsMatch = headerText.match(new RegExp(numRe + '\\s*contributors', 'iu'));
    const followersMatch = headerText.match(new RegExp(numRe + '\\s*followers', 'iu'));

    // Activity summary: first remaining line that is not name/description/counts/follow button.
    let activitySummary = null;
    for (const line of lines) {
      if (line === name || line === description) continue;
      if (/contributors|followers/i.test(line)) continue;
      if (/^follow\s*space/i.test(line)) continue;
      activitySummary = line;
      break;
    }

    return {
      name,
      url: location.href,
      description,
      contributorCount: contributorsMatch ? contributorsMatch[1] : null,
      followerCount: followersMatch ? followersMatch[1] : null,
      activitySummary
    };
  });
}

// Scroll-collect items from the Posts / Top / Recent stream.
async function extractPosts(page, limit, space) {
  const itemSelector = '.puppeteer_test_tribe_post_item_feed_story, .puppeteer_test_tribe_answer_feed_story, .puppeteer_test_question_component_base';

  try {
    await page.waitForSelector(itemSelector, { timeout: 15000 });
  } catch (e) {
    return { items: [], partial: true };
  }

  const seen = new Set();
  let lastCount = 0;
  let stallCount = 0;

  while (seen.size < limit && stallCount < 4) {
    const batch = await page.evaluate(({ sel, domain, max }) => {
      function text(el) { return (el && el.innerText ? el.innerText : '').trim(); }

      function findMainUrl(node, type) {
        for (const a of node.querySelectorAll('a[href]')) {
          const href = a.href;
          if (!href || href.includes('/profile/')) continue;
          if (type === 'question' && href.includes(domain + '.quora.com/')) return href;
          if (type === 'answer' && href.includes('/answer/')) return href;
          if (type === 'post' && href.includes(domain + '.quora.com/')) return href;
        }
        for (const a of node.querySelectorAll('a[href]')) {
          const href = a.href;
          if (href && !href.includes('/profile/')) return href;
        }
        return null;
      }

      function uniqueCounts(node) {
        const found = [];
        const seen = new Set();
        for (const el of node.querySelectorAll('*')) {
          const t = text(el);
          if (/^[\p{Nd},.]+[KMB]?$/u.test(t) && !seen.has(t)) {
            seen.add(t);
            found.push(t);
          }
        }
        return found;
      }

      function contentTexts(node) {
        const qtext = Array.from(node.querySelectorAll('.q-text')).map(text)
          .filter(t => t.length > 30 && !/[·|]/.test(t) && !/(updated\s+)?\d+\s*[smhdwy](?:\s+ago)?/i.test(t) && !/^follow$/i.test(t));
        if (qtext.length) return qtext.sort((a, b) => b.length - a.length);
        return Array.from(node.querySelectorAll('p, span')).map(text).filter(t => t.length > 40);
      }

      function parseQuestionCard(node) {
        const titleEl = node.querySelector('.puppeteer_test_question_title');
        const title = titleEl ? text(titleEl) : '';
        const link = titleEl ? (titleEl.closest('a') || titleEl.querySelector('a')) : null;
        const url = link ? link.href : null;
        const t = text(node);
        const answerMatch = t.match(/([\p{Nd},.]+[KMB]?)\s+answers?/iu) || t.match(/no\s+answers?/iu);
        const answerCount = answerMatch ? answerMatch[0] : null;
        const followedMatch = t.match(/last\s+followed\s+[^\n]+/i);
        return { type: 'question', title, url, answerCount, lastFollowed: followedMatch ? followedMatch[0].trim() : null };
      }

      function parsePostOrAnswer(node, type, domain) {
        const t = text(node);
        const url = findMainUrl(node, type);
        const contents = contentTexts(node);
        const mainLink = url ? node.querySelector('a[href="' + url.replace(/"/g, '\\"') + '"]') : null;
        const linkText = mainLink ? text(mainLink) : '';

        // Author: prefer a profile link that actually has text.
        let author = null;
        let credential = null;
        const profileLinks = Array.from(node.querySelectorAll('a[href*="/profile/"]')).filter(a => text(a).length > 0);
        if (profileLinks.length) {
          const a = profileLinks[0];
          author = { name: text(a), profileUrl: a.href };
        }

        // Credential: line after author, before the relative timestamp.
        if (author) {
          const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
          let foundName = false;
          for (const line of lines) {
            if (line === author.name || line.includes(author.name)) { foundName = true; continue; }
            if (!foundName) continue;
            if (/^(follow|pinned|updated|\d+\s*[smhdwy]|·)/i.test(line)) continue;
            if (/^[\p{Nd},.]+[KMB]?$/u.test(line)) continue;
            if (line.length > 5) { credential = line; break; }
          }
        }

        let publishedAt = null;
        for (const line of t.split('\n').map(l => l.trim()).filter(Boolean)) {
          if (/^(updated\s+)?\d+\s*[smhdwy](?:\s+ago)?$/i.test(line)) {
            publishedAt = line;
            break;
          }
        }

        const counts = uniqueCounts(node);
        const upvoteCount = counts[0] || null;
        const commentCount = counts[1] || null;

        const isPinned = /^pinned/i.test(t);

        // Title strategy:
        // - Posts have no explicit title element; use the start of the main content.
        // - Answers usually link to the question, so use the link text when it looks like a question.
        let title = '';
        if (type === 'post') {
          title = contents[0] ? contents[0].replace(/\s+/g, ' ').slice(0, 140) : (linkText || '');
        } else {
          title = (linkText && (linkText.endsWith('?') || linkText.length > 30)) ? linkText : (contents[0] ? contents[0].slice(0, 140) : '');
        }

        let excerpt = null;
        if (contents[0]) {
          excerpt = contents[0].replace(/\s+/g, ' ');
        }

        const item = {
          type,
          title: title || undefined,
          url,
          author,
          publishedAt,
          upvoteCount,
          commentCount,
          isPinned: isPinned || undefined,
          excerpt
        };
        if (!item.title) delete item.title;
        if (!item.isPinned) delete item.isPinned;
        return item;
      }

      const out = [];
      const postRe = /puppeteer_test_tribe_post_item_feed_story/;
      const answerRe = /puppeteer_test_tribe_answer_feed_story/;
      const questionRe = /puppeteer_test_question_component_base/;

      for (const node of document.querySelectorAll(sel)) {
        const cls = node.className || '';
        let type = 'unknown';
        if (postRe.test(cls)) type = 'post';
        else if (answerRe.test(cls)) type = 'answer';
        else if (questionRe.test(cls)) type = 'question';

        const key = findMainUrl(node, type) || `${type}-${text(node).slice(0, 80)}`;
        if (out.some(i => i._key === key)) continue;
        const parsed = type === 'question' ? parseQuestionCard(node) : parsePostOrAnswer(node, type, domain);
        parsed._key = key;
        out.push(parsed);
        if (out.length >= max) break;
      }
      return out;
    }, { sel: itemSelector, domain: space, max: limit });

    const before = seen.size;
    for (const item of batch) {
      const key = item._key;
      delete item._key;
      seen.add(key);
    }

    if (seen.size === before) {
      stallCount++;
    } else {
      stallCount = 0;
      lastCount = seen.size;
    }

    if (seen.size < limit && stallCount < 4) {
      await humanScroll(page, randomInt(2, 4));
      await humanPause(page);
    }
  }

  // Re-collect full data for the kept keys in case the DOM changed during scrolling.
  const keys = Array.from(seen).slice(0, limit);
  const items = await page.evaluate(({ sel, domain, keyList }) => {
    function text(el) { return (el && el.innerText ? el.innerText : '').trim(); }

    function findMainUrl(node, type) {
      for (const a of node.querySelectorAll('a[href]')) {
        const href = a.href;
        if (!href || href.includes('/profile/')) continue;
        if (type === 'question' && href.includes(domain + '.quora.com/')) return href;
        if (type === 'answer' && href.includes('/answer/')) return href;
        if (type === 'post' && href.includes(domain + '.quora.com/')) return href;
      }
      for (const a of node.querySelectorAll('a[href]')) {
        const href = a.href;
        if (href && !href.includes('/profile/')) return href;
      }
      return null;
    }

    function uniqueCounts(node) {
      const found = [];
      const seen = new Set();
      for (const el of node.querySelectorAll('*')) {
        const t = text(el);
        if (/^[\p{Nd},.]+[KMB]?$/u.test(t) && !seen.has(t)) {
          seen.add(t);
          found.push(t);
        }
      }
      return found;
    }

    function contentTexts(node) {
      const qtext = Array.from(node.querySelectorAll('.q-text')).map(text)
        .filter(t => t.length > 30 && !/[·|]/.test(t) && !/(updated\s+)?\d+\s*[smhdwy](?:\s+ago)?/i.test(t) && !/^follow$/i.test(t));
      if (qtext.length) return qtext.sort((a, b) => b.length - a.length);
      return Array.from(node.querySelectorAll('p, span')).map(text).filter(t => t.length > 40);
    }

    function parseQuestionCard(node) {
      const titleEl = node.querySelector('.puppeteer_test_question_title');
      const title = titleEl ? text(titleEl) : '';
      const link = titleEl ? (titleEl.closest('a') || titleEl.querySelector('a')) : null;
      const url = link ? link.href : null;
      const t = text(node);
      const answerMatch = t.match(/([\p{Nd},.]+[KMB]?)\s+answers?/iu) || t.match(/no\s+answers?/iu);
      const answerCount = answerMatch ? answerMatch[0] : null;
      const followedMatch = t.match(/last\s+followed\s+[^\n]+/i);
      return { type: 'question', title, url, answerCount, lastFollowed: followedMatch ? followedMatch[0].trim() : null };
    }

    function parsePostOrAnswer(node, type, domain) {
      const t = text(node);
      const url = findMainUrl(node, type);
      const contents = contentTexts(node);
      const mainLink = url ? node.querySelector('a[href="' + url.replace(/"/g, '\\"') + '"]') : null;
      const linkText = mainLink ? text(mainLink) : '';

      let author = null;
      let credential = null;
      const profileLinks = Array.from(node.querySelectorAll('a[href*="/profile/"]')).filter(a => text(a).length > 0);
      if (profileLinks.length) {
        const a = profileLinks[0];
        author = { name: text(a), profileUrl: a.href };
      }

      if (author) {
        const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
        let foundName = false;
        for (const line of lines) {
          if (line === author.name || line.includes(author.name)) { foundName = true; continue; }
          if (!foundName) continue;
          if (/^(follow|pinned|updated|\d+\s*[smhdwy]|·)/i.test(line)) continue;
          if (/^[\p{Nd},.]+[KMB]?$/u.test(line)) continue;
          if (line.length > 5) { credential = line; break; }
        }
      }

      let publishedAt = null;
      for (const line of t.split('\n').map(l => l.trim()).filter(Boolean)) {
        if (/^(updated\s+)?\d+\s*[smhdwy](?:\s+ago)?$/i.test(line)) {
          publishedAt = line;
          break;
        }
      }

      const counts = uniqueCounts(node);
      const upvoteCount = counts[0] || null;
      const commentCount = counts[1] || null;

      const isPinned = /^pinned/i.test(t);

      let title = '';
      if (type === 'post') {
        title = contents[0] ? contents[0].replace(/\s+/g, ' ').slice(0, 140) : (linkText || '');
      } else {
        title = (linkText && (linkText.endsWith('?') || linkText.length > 30)) ? linkText : (contents[0] ? contents[0].slice(0, 140) : '');
      }

      let excerpt = null;
      if (contents[0]) {
        excerpt = contents[0].replace(/\s+/g, ' ');
      }

      const item = {
        type,
        title: title || undefined,
        url,
        author,
        publishedAt,
        upvoteCount,
        commentCount,
        isPinned: isPinned || undefined,
        excerpt
      };
      if (!item.title) delete item.title;
      if (!item.isPinned) delete item.isPinned;
      return item;
    }

    const postRe = /puppeteer_test_tribe_post_item_feed_story/;
    const answerRe = /puppeteer_test_tribe_answer_feed_story/;
    const questionRe = /puppeteer_test_question_component_base/;
    const out = [];
    for (const node of document.querySelectorAll(sel)) {
      const cls = node.className || '';
      let type = 'unknown';
      if (postRe.test(cls)) type = 'post';
      else if (answerRe.test(cls)) type = 'answer';
      else if (questionRe.test(cls)) type = 'question';
      const key = findMainUrl(node, type) || `${type}-${text(node).slice(0, 80)}`;
      if (!keyList.includes(key)) continue;
      const parsed = type === 'question' ? parseQuestionCard(node) : parsePostOrAnswer(node, type, domain);
      out.push(parsed);
    }
    return out;
  }, { sel: itemSelector, domain: space, keyList: keys });

  return { items, partial: items.length < limit };
}

// Extract items from the Questions tab.
async function extractQuestions(page, limit) {
  const selector = '.puppeteer_test_question_component_base';
  try {
    await page.waitForSelector(selector, { timeout: 15000 });
  } catch (e) {
    return { items: [], partial: true };
  }

  let lastCount = 0;
  let stallCount = 0;
  while (stallCount < 2) {
    const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
    if (count === lastCount) {
      stallCount++;
    } else {
      stallCount = 0;
      lastCount = count;
    }
    if (count >= limit) break;
    await humanScroll(page, randomInt(2, 3));
    await humanPause(page);
  }

  const items = await page.evaluate(({ sel, max }) => {
    function text(el) { return (el && el.innerText ? el.innerText : '').trim(); }
    function parseQuestionCard(node) {
      const titleEl = node.querySelector('.puppeteer_test_question_title');
      const title = titleEl ? text(titleEl) : '';
      const link = titleEl ? (titleEl.closest('a') || titleEl.querySelector('a')) : null;
      const url = link ? link.href : null;
      const t = text(node);
      const answerMatch = t.match(/([\p{Nd},.]+[KMB]?)\s+answers?/iu) || t.match(/no\s+answers?/iu);
      const answerCount = answerMatch ? answerMatch[0] : null;
      const followedMatch = t.match(/last\s+followed\s+[^\n]+/i);
      return { type: 'question', title, url, answerCount, lastFollowed: followedMatch ? followedMatch[0].trim() : null };
    }

    const nodes = document.querySelectorAll(sel);
    const out = [];
    for (let i = 0; i < Math.min(nodes.length, max); i++) {
      out.push(parseQuestionCard(nodes[i]));
    }
    return out;
  }, { sel: selector, max: limit });

  return { items, partial: items.length < limit };
}

// Extract the long description from the About tab.
async function extractAbout(page) {
  const details = await page.evaluate(() => {
    // Prefer an explicit details section if present.
    const explicit = document.querySelector('.puppeteer_test_tribe_about_section, .puppeteer_test_tribe_details, [class*="about_details"], [class*="tribe_about"]');
    if (explicit) {
      const txt = explicit.innerText.trim();
      if (txt.length > 200) return txt;
    }

    // Collect long text blocks and pick the one that is most likely the Details body.
    let best = null;
    let bestLen = 0;
    for (const el of document.querySelectorAll('div, span, p, section')) {
      const txt = (el.innerText || '').trim();
      if (txt.length < 500) continue;
      if (el.querySelector('.puppeteer_test_tribe_info_header')) continue;
      // Skip blocks that are clearly metadata / contributor list headers.
      if (/^\s*\d+\s+contributors|^follow space/i.test(txt)) continue;
      if (txt.length > bestLen) {
        bestLen = txt.length;
        best = txt;
      }
    }
    return best;
  });

  if (!details) {
    return { items: [], partial: true };
  }
  return { items: [{ type: 'about', details }], partial: false };
}

// Extract the contributor list rendered inside the About tab.
async function extractContributors(page, limit) {
  const selector = 'a[href*="/profile/"]';
  const seen = new Set();
  let lastCount = 0;
  let stallCount = 0;

  while (seen.size < limit && stallCount < 4) {
    const batch = await page.evaluate(({ sel, max }) => {
      const out = [];
      for (const link of document.querySelectorAll(sel)) {
        if (link.closest('.puppeteer_test_tribe_info_header')) continue;
        const href = link.href || '';
        if (!href.includes('/profile/')) continue;
        const name = (link.innerText || '').trim();
        if (!name) continue;
        if (out.some(x => x.profileUrl === href)) continue;
        out.push({ profileUrl: href, name });
        if (out.length >= max) break;
      }
      return out;
    }, { sel: selector, max: limit });

    const before = seen.size;
    for (const c of batch) seen.add(c.profileUrl);

    if (seen.size === before) {
      stallCount++;
    } else {
      stallCount = 0;
      lastCount = seen.size;
    }

    if (seen.size < limit && stallCount < 4) {
      await humanScroll(page, randomInt(3, 5));
      await humanPause(page);
    }
  }

  const urls = Array.from(seen).slice(0, limit);
  const items = await page.evaluate(({ sel, urlList }) => {
    function text(el) { return (el && el.innerText ? el.innerText : '').trim(); }
    const map = new Map();
    for (const link of document.querySelectorAll(sel)) {
      const href = link.href || '';
      if (!urlList.includes(href) || map.has(href)) continue;
      if (link.closest('.puppeteer_test_tribe_info_header')) continue;
      const name = text(link);
      if (!name) continue;

      // Credential is a nearby text node that is not the name itself or tab UI text.
      let credential = null;
      const parent = link.parentElement;
      if (parent) {
        const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const line = node.textContent.trim();
          if (!line || line === name) continue;
          if (/^(about|posts|questions)$/i.test(line)) continue;
          if (/^\d+\s*[smhdwy]/i.test(line)) continue;
          if (line.length > 5) { credential = line; break; }
        }
      }
      map.set(href, { name, profileUrl: href, credential });
    }
    return urlList.map(url => map.get(url)).filter(Boolean);
  }, { sel: selector, urlList: urls });

  return { items, partial: items.length < limit };
}

export default async (page, params, cwd) => {
  // ---------- parameter validation ----------
  if (!params.space || !params.space.trim()) {
    fail('MISSING_PARAM', 'space is required');
  }
  const space = params.space.trim().toLowerCase();
  const section = params.section.trim().toLowerCase();
  const sort = params.sort.trim().toLowerCase();

  if (!SECTIONS.includes(section)) {
    fail('INVALID_PARAM', `section must be one of: ${SECTIONS.join(', ')}`);
  }
  if (!SORTS.includes(sort)) {
    fail('INVALID_PARAM', `sort must be one of: ${SORTS.join(', ')}`);
  }

  const limit = parseInt(params.limit, 10);
  if (Number.isNaN(limit) || limit < 1 || limit > 100) {
    fail('INVALID_PARAM', 'limit must be an integer between 1 and 100');
  }

  const targetUrl = buildUrl({ space, section, sort });

  // ---------- navigation ----------
  await humanPause(page);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wait(page, randomInt(600, 1200));

  // Detect non-existent Space: Quora redirects unknown subdomains to www.quora.com
  const finalUrl = page.url();
  if (finalUrl.replace(/^https?:\/\//, '').startsWith('www.quora.com')) {
    fail('NOT_FOUND', `Space "${space}" not found (redirected to Quora home)`);
  }

  // Wait for the Space header/name as a structural sanity check.
  try {
    await page.waitForSelector('.puppeteer_test_tribe_name, .puppeteer_test_tribe_info_header', { timeout: 15000 });
  } catch (e) {
    fail('DRIFT_DETECTED', 'Space header selectors not found; page structure may have changed');
  }

  await humanPause(page);

  // ---------- metadata extraction ----------
  const meta = await extractMeta(page);
  if (!meta.name) {
    fail('DRIFT_DETECTED', 'Could not extract Space name');
  }

  // ---------- section extraction ----------
  let result;
  if (section === 'about') {
    result = await extractAbout(page);
  } else if (section === 'contributors') {
    result = await extractContributors(page, limit);
  } else if (section === 'questions') {
    result = await extractQuestions(page, limit);
  } else {
    result = await extractPosts(page, limit, space);
  }

  return {
    space: meta,
    section,
    sort: section === 'posts' ? sort : undefined,
    items: result.items,
    partial: result.partial
  };
};
