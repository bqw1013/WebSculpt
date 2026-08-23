// facebook/get-group — fetch a Facebook Group's info (name, members, privacy, about) and its post feed.
// Runtime: browser (attaches to the user's Chrome via CDP, reusing the active Facebook login).
// Anchors are role/attribute/URL based only; Facebook uses obfuscated class names throughout.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Natural, randomized scrolling: occasional mouse move + randomized window scroll + small wheel, with short pauses.
async function naturalScroll(page) {
  const h = await page.evaluate(() => window.innerHeight || 800);
  const delta = Math.round(h * (0.9 + Math.random() * 0.4));
  if (Math.random() < 0.25) {
    try {
      await page.mouse.move(300 + Math.random() * 500, 200 + Math.random() * 400);
    } catch (e) { /* ignore */ }
  }
  await page.evaluate((d) => window.scrollBy(0, d), delta);
  await sleep(100 + Math.random() * 150);
  try {
    await page.mouse.wheel(0, Math.round(delta * 0.4));
  } catch (e) { /* ignore */ }
  await sleep(250 + Math.random() * 400);
}

// Runs in the browser page context. Self-contained (no closures over module scope).
const extractGroupInfo = () => {
  const out = { name: null, combined: null, members: null, privacy: 'unknown', about: null };
  const main = document.querySelector('[role=main]');
  const h1s = main ? [...main.querySelectorAll('h1')] : [];
  out.name = h1s.map((h) => h.innerText.trim()).find((t) => t && t !== '通知') || null;
  let combined = null;
  document.querySelectorAll('div,span').forEach((e) => {
    const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
    if (!combined && /(公开小组|私密小组|已关闭群组)/.test(t) && /成员/.test(t) && t.length < 80) combined = t;
  });
  out.combined = combined;
  const m = combined ? combined.match(/([0-9][0-9.,]*)\s*(万|K)?\s*位?成员/) : null;
  if (m && m[1]) {
    const num = parseFloat(m[1].replace(/,/g, ''));
    const mult = m[2] === '万' ? 10000 : m[2] === 'K' ? 1000 : 1;
    out.members = Math.round(num * mult);
  }
  if (combined) out.privacy = combined.includes('公开小组') ? 'public' : combined.includes('私密小组') ? 'private' : 'unknown';
  let about = null;
  document.querySelectorAll('div,span').forEach((e) => {
    const t = (e.innerText || '').trim();
    if (!about && t.length > 50 && t.length < 400 && !t.includes('\n') && /(join|welcome|group|欢迎|加入|小组)/i.test(t) && !t.includes('任何人')) about = t;
  });
  out.about = about || null;
  return out;
};

// Runs in the browser page context. Self-contained. Extracts the currently-rendered post window.
const extractPosts = () => {
  const dedupe = (s) => {
    if (!s) return s;
    const h = Math.floor(s.length / 2);
    if (s.slice(0, h) === s.slice(h)) s = s.slice(0, h);
    return s;
  };
  // Strip Facebook tracking query params, keeping a clean navigable URL.
  const cleanUrl = (u) => {
    const [path, q] = u.split('?');
    if (!q) return path.replace(/\/$/, '');
    const keep = q.split('&').filter((p) => p && !p.startsWith('__') && p !== 's=ifu');
    const c = keep.length ? path + '?' + keep.join('&') : path;
    return c.replace(/\/$/, '');
  };
  const posts = [];
  document.querySelectorAll('div[role=article]').forEach((art) => {
    const links = [...art.querySelectorAll('a[href]')].map((l) => ({
      h: l.href.replace(/[?&]__cft__.*$/, ''),
      t: (l.innerText || '').replace(/\s+/g, ' ').trim(),
    }));
    const perm = links.find((x) => /\/groups\/[^/]+\/posts\/[0-9]+\//.test(x.h) && !x.h.includes('comment_id'));
    if (!perm) return;
    const idMatch = perm.h.match(/posts\/([0-9]+)/);
    if (!idMatch) return;
    const postId = idMatch[1];
    // The raw anchor href (groups/{id}/posts/{postId}/) is a real navigable URL;
    // do NOT rebuild a /permalink/{postId}/ URL — the feed's postId is sometimes a
    // non-canonical story id that only resolves in the /posts/ form.
    const permalink = cleanUrl(perm.h);

    const userLinks = links.filter((x) => /\/groups\/[0-9]+\/user\/[0-9]+\//.test(x.h));
    const author = userLinks.find((x) => x.t) || userLinks[0] || null;
    const time = links.find((x) => x.h === perm.h && x.t && x.t.length < 12) || null;

    // text cascade: data-ad-preview -> meaningful dir=auto -> longest leaf div.
    // Operates on the live article; elements inside nested comment articles are skipped
    // (no expensive cloneNode — Facebook articles are very deep).
    let text = null;
    const adp = art.querySelector('[data-ad-preview=message]');
    if (adp) {
      text = dedupe(adp.innerText.trim());
    } else {
      const commentEls = [...art.querySelectorAll('[role=article]')];
      const inComment = (el) => commentEls.some((c) => c.contains(el));
      const bad = ['查看翻译', '查看更多评论', '发表公开评论…', '赞', '评论', '分享', '回复'];
      const dirs = [];
      art.querySelectorAll('[dir=auto]').forEach((e) => {
        if (inComment(e)) return;
        const t = e.innerText.trim();
        if (t && !bad.includes(t) && !/^[0-9.,Kk万]+$/.test(t) && t.length > 2) dirs.push(t);
      });
      if (dirs.length) {
        text = dedupe(dirs[0]);
      } else {
        let best = null;
        art.querySelectorAll('div').forEach((e) => {
          if (inComment(e)) return;
          const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
          if (t.length < 8) return;
          if (author && author.t && t.startsWith(author.t)) return;
          if (t.includes('发表公开评论') || t.includes('查看翻译')) return;
          if (t.startsWith('分享对象') || t === 'AI 内容') return;
          let same = false;
          [...e.querySelectorAll('div')].forEach((ch) => {
            if ((ch.innerText || '').replace(/\s+/g, ' ').trim() === t) same = true;
          });
          if (same) return;
          if (!best || t.length > best.len) best = { t, len: t.length };
        });
        if (best) text = dedupe(best.t);
      }
    }

    const media = [];
    [...art.querySelectorAll('img[src*="scontent"], img[src*="fbcdn"]')].forEach((img) => {
      const src = img.src || '';
      if (/static\.xx\.fbcdn\.net/.test(src)) return; // UI assets/emoji/placeholders, not real post media
      media.push({ type: 'photo', url: src });
    });
    const vid = art.querySelector('video');
    const vidSrc = vid ? (vid.currentSrc || vid.src || null) : null;
    if (vidSrc) media.push({ type: 'video', url: vidSrc });

    posts.push({
      postId,
      permalink,
      author: author ? { name: author.t || null, url: author.h } : null,
      text: text || null,
      time: time ? time.t : null,
      media,
    });
  });
  return posts;
};

export default async (page, params, cwd) => {
  const group = (params.group || '').trim();
  if (!group) {
    const e = new Error('[MISSING_PARAM] group is required: numeric group ID or vanity name');
    e.code = 'MISSING_PARAM';
    throw e;
  }

  const rawLimit = params.limit === undefined || params.limit === null ? '20' : String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) {
    const e = new Error('[INVALID_PARAM] limit must be an integer between 1 and 100, got: ' + rawLimit);
    e.code = 'INVALID_PARAM';
    throw e;
  }
  const limit = parseInt(rawLimit, 10);
  if (limit < 1 || limit > 100) {
    const e = new Error('[INVALID_PARAM] limit must be an integer between 1 and 100, got: ' + rawLimit);
    e.code = 'INVALID_PARAM';
    throw e;
  }

  const groupUrl = 'https://www.facebook.com/groups/' + encodeURIComponent(group) + '/';

  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    // retry once (navigation may time out on slow loads)
    try {
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (err2) {
      const err = new Error('[NAVIGATION_FAILED] Could not load the group page');
      err.code = 'NAVIGATION_FAILED';
      throw err;
    }
  }
  await sleep(2000 + Math.random() * 1500);

  const info = await page.evaluate(extractGroupInfo);

  // Failure detection: group does not exist or page changed structurally.
  if (!info.name && !info.combined) {
    const pageInfo = await page.evaluate(() => {
      const main = document.querySelector('[role=main]');
      return {
        title: document.title || '',
        body: (document.body.innerText || '').slice(0, 1500),
        mainLen: main ? (main.innerText || '').trim().length : 0,
      };
    });
    const hay = pageInfo.title + ' ' + pageInfo.body;
    const notFoundRe = /找不到|不存在|不可见|不可用|无法访问|无法显示|无法找到|页面不存在|已被移除|已删除|Page not found|not found|doesn'?t exist|no longer available|此内容|unavailable|n'a pas|não existe|不存在の/i;
    if (notFoundRe.test(hay) || pageInfo.mainLen < 30) {
      const e = new Error('[NOT_FOUND] Group not found or not accessible: ' + group);
      e.code = 'NOT_FOUND';
      throw e;
    }
    const e = new Error('[DRIFT_DETECTED] Expected group header anchors were not found');
    e.code = 'DRIFT_DETECTED';
    throw e;
  }

  // Scroll + collect. The feed is scroll-lazy-loaded and DOM-virtualized, so we must
  // extract the current DOM window each iteration and dedupe by postId.
  const collected = [];
  const seen = new Set();
  let noProgress = 0;
  const MAX_SCROLLS = 120;

  for (let i = 0; i < MAX_SCROLLS && collected.length < limit; i++) {
    let batch = [];
    try {
      batch = await page.evaluate(extractPosts);
    } catch (e) {
      // transient evaluate error; treat as empty batch and retry once more
      batch = [];
    }
    let added = 0;
    for (const p of batch) {
      if (!seen.has(p.postId)) {
        seen.add(p.postId);
        collected.push(p);
        added++;
      }
    }
    if (collected.length >= limit) break;
    if (added === 0) {
      noProgress++;
      if (noProgress >= 5) break;
    } else {
      noProgress = 0;
    }
    await naturalScroll(page);
  }

  const posts = collected.slice(0, limit).map((p) => ({
    author: p.author,
    text: p.text,
    permalink: p.permalink,
    time: p.time,
    media: p.media,
  }));

  return {
    name: info.name,
    url: groupUrl,
    members: info.members,
    privacy: info.privacy,
    about: info.about,
    posts,
    partial: collected.length < limit,
  };
};
