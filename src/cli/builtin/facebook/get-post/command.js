// facebook/get-post — fetch a single Facebook post with full text, author, time,
// media, engagement stats, and optionally comments with nested replies.
//
// Explore-verified anchors (no class names relied upon):
//   - div[role="article"]  : post + comments container
//   - div[data-ad-preview="message"] / div[dir="auto"] : post/comment text
//   - [aria-label]         : time (absolute datetime), like counts, author
//   - [role="button"] text "查看更多评论" : incremental comment paging (~10/click)
//   - [role="button"] text "查看N条回复" : reply thread expansion

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

async function waitRandom(min, max) {
  const ms = Math.floor(min + Math.random() * (max - min + 1));
  await new Promise(resolve => setTimeout(resolve, ms));
}

// Normalize the input URL.
// - Requires a facebook.com URL.
// - /permalink.php?story_fbid=<pfbid>... does NOT resolve in the modern Comet app
//   (explore-verified: page renders "内容暂时无法显示"). Navigating it directly and
//   detecting that failure is the correct behavior; the id param cannot reliably be
//   used to rewrite to /posts/ (it may redirect to a wrong post), so we keep it as-is.
function normalizeUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) fail("MISSING_PARAM", "url is required");
  if (!/^https?:\/\/(www\.|m\.|mobile\.)?facebook\.com\//i.test(url)) {
    fail("INVALID_PARAM", "url must be a facebook.com post URL");
  }
  return url;
}

function parseCommentLimit(raw) {
  const value = String(raw).trim();
  if (value === "") return 20;
  if (!/^\d+$/.test(value)) fail("INVALID_PARAM", "comment_limit must be an integer between 1 and 100");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 100) {
    fail("INVALID_PARAM", "comment_limit must be an integer between 1 and 100");
  }
  return n;
}

// Parse the post identity (numeric group-post id or pfbid) from a URL string.
// Used on the INPUT url as well as location.href: Facebook may still be showing
// the group feed (a /groups/{id}/ URL) when the post page settles, so reading
// only location.href at extraction time is racy. Keep the input id as a fallback.
function urlIdFromString(href) {
  const g = href.match(/groups\/[\w.-]+\/permalink\/(\d+)/);
  if (g) return g[1];
  const gp = href.match(/groups\/[\w.-]+\/posts\/(\d+)/);
  if (gp) return gp[1];
  const p = href.match(/\/(?:[\w.-]+)\/posts\/(pfbid[\w]+)/);
  if (p) return p[1];
  const php = href.match(/permalink\.php\?[^#]*story_fbid=([^&]+)/);
  if (php) return decodeURIComponent(php[1]);
  const w = href.match(/\/watch\/?\?.*v=(\d+)/);
  if (w) return w[1];
  return null;
}

// In-page state detection: returns "ok" | "unavailable" | "auth" | "feed" | "unknown".
async function detectState(page) {
  const body = await page.locator("body").innerText().catch(() => "");
  if (/内容暂时无法显示|页面无法显示|链接可能已损坏|content temporarily unavailable|content is unavailable/i.test(body)) {
    return "unavailable";
  }
  if (/checkpoint|login_challenge|login_required/i.test(page.url())) return "auth";
  const emailCount = await page.locator('input[name="email"]').count().catch(() => 0);
  if (emailCount > 0) return "auth";

  const articleCount = await page.locator('div[role="article"]').count().catch(() => 0);
  if (articleCount === 0 && !/\/videos\/\d+|\/reel\/\d+|\/watch\/?\?/.test(page.url())) {
    // No article on a standard post page may still be a splash/late render.
    await waitRandom(1200, 2200);
    const retry = await page.locator('div[role="article"]').count().catch(() => 0);
    if (retry === 0) {
      const body2 = await page.locator("body").innerText().catch(() => "");
      if (/内容暂时无法显示|页面无法显示|链接可能已损坏|content temporarily unavailable|content is unavailable/i.test(body2)) {
        return "unavailable";
      }
      return "unknown";
    }
  }
  return "ok";
}

// --- main post extraction (standard /posts/ and /groups/.../permalink/ pages) ---
async function extractStandardPost(page, inputUrlId) {
  return page.evaluate((fallbackUrlId) => {
    const arts = [...document.querySelectorAll('div[role="article"]')];
    const nonEmpty = arts.filter(a => a.textContent.trim().length > 0);
    // Some group posts render the message twice in the DOM; halve exact duplicates.
    const dedupe = (s) => {
      if (!s) return s;
      const h = Math.floor(s.length / 2);
      if (s.slice(0, h) === s.slice(h)) s = s.slice(0, h);
      return s;
    };

    // Identify the post id / pfbid from the URL so we can pick the article that is
    // actually the current post (sidebar "related" suggestions vary per load and can
    // be larger than a short group post message). location.href may still be the
    // group feed URL if extraction runs before the post page settles, so fall back
    // to the id parsed from the input URL.
    const urlId = (() => {
      const href = location.href;
      const g = href.match(/groups\/[\w.-]+\/permalink\/(\d+)/);
      if (g) return g[1];
      // Group feed anchors use /groups/{id}/posts/{numeric}/ — the raw href form
      // (unlike page posts, the feed id is a plain number, not a pfbid).
      const gp = href.match(/groups\/[\w.-]+\/posts\/(\d+)/);
      if (gp) return gp[1];
      const p = href.match(/\/(?:[\w.-]+)\/posts\/(pfbid[\w]+)/);
      if (p) return p[1];
      const php = href.match(/permalink\.php\?[^#]*story_fbid=([^&]+)/);
      if (php) return decodeURIComponent(php[1]);
      return null;
    })() || fallbackUrlId || null;

    const urlAuthor = (() => {
      const m = location.href.match(/facebook\.com\/([\w.-]+)\/posts\//);
      return m ? m[1].toLowerCase() : null;
    })();

    const candidates = [];
    for (let i = 0; i < arts.length; i++) {
      const a = arts[i];
      if (!a.textContent.trim()) continue;
      const aria = [...a.querySelectorAll('[aria-label]')].map(e => e.getAttribute("aria-label")).join(" ");
      if (/分享对象：/.test(a.textContent) && /赞：/.test(aria)) candidates.push({ a, i });
    }

    const optionsAuthor = (a) => {
      const aria = [...a.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label") || "").join(" ");
      const m = aria.match(/可对(.+?)的这篇帖子执行的操作/);
      return m ? m[1].trim() : null;
    };

    let main = null;
    let mainIndex = -1;
    let matchedVia = null;
    // 1. Article whose options-aria author matches the URL author segment
    //    (handles pages where the internal permalink pfbid differs from the URL,
    //    and avoids matching repost/sidebar articles that also contain the URL id).
    if (urlAuthor) {
      for (const { a, i } of candidates) {
        const author = optionsAuthor(a);
        if (author && (author.toLowerCase().includes(urlAuthor) || urlAuthor.includes(author.toLowerCase()))) {
          main = a;
          mainIndex = i;
          matchedVia = "author";
          break;
        }
      }
    }
    // 2. Article whose links/HTML contain the URL post id.
    if (!main && urlId) {
      // Scan ALL articles for the id in their outerHTML FIRST. The target article's
      // own HTML carries the id (its timestamp/permalink link), while sidebar
      // "recommended" cards can have a RESOLVED link href that happens to include the
      // id — link-based matching is therefore too noisy. Group posts with no like-count
      // aria are also excluded from candidates, so this scan is the only way to reach
      // them. The first DOM-order match is the main post (comments are nested inside it
      // and come later).
      for (let i = 0; i < arts.length; i++) {
        const a = arts[i];
        if (!a.textContent.trim()) continue;
        if ((a.outerHTML || "").includes(urlId)) {
          main = a;
          mainIndex = i;
          matchedVia = "id";
          break;
        }
      }
      // Fallback: candidate link matching for page posts whose id only appears in
      // resolved link hrefs (rare; outerHTML is authoritative when present).
      if (!main) {
        for (const { a, i } of candidates) {
          const matches = [...a.querySelectorAll("a[href]")].some(x => x.href.includes(urlId)) ||
            (a.outerHTML || "").includes(urlId);
          if (matches && (!main || a.textContent.length > main.textContent.length)) {
            main = a;
            mainIndex = i;
            matchedVia = "id";
          }
        }
      }
    }
    // 3. If the URL carried no post identity at all, fall back to the largest candidate
    //    (all supported URL forms carry identity, so this is a defensive fallback).
    if (!main && !urlId && !urlAuthor) {
      for (const { a, i } of candidates) {
        if (!main || a.textContent.length > main.textContent.length) { main = a; mainIndex = i; }
      }
      matchedVia = "fallback";
    }
    if (!main) return { post: null, mainIndex: -1, notFound: true, matchedVia };

    const textContent = main.textContent.trim();
    const links = [...main.querySelectorAll("a[href]")].map(a => a.href);

    // aria-labels belonging to the main post itself (comments may be nested inside
    // the main article in the DOM, so exclude arias whose nearest article is a comment).
    const ownAria = [...main.querySelectorAll("[aria-label]")]
      .filter(e => !e.closest('div[role="article"]') || e.closest('div[role="article"]') === main)
      .map(e => e.getAttribute("aria-label"))
      .filter(Boolean);

    // author: "可对X的这篇帖子执行的操作" aria captures the author name reliably on
    // standard and group posts; fallback to the author link's text / a short aria.
    const actionAria = ownAria.find(l => /可对.*的这篇帖子执行的操作/.test(l)) || null;
    let authorName = null;
    if (actionAria) {
      const m = actionAria.match(/可对(.+?)的这篇帖子执行的操作/);
      if (m) authorName = m[1].trim();
    }
    const authorLinkEl = [...main.querySelectorAll("a[href]")].find(a => {
      const base = a.href.split("?")[0].replace(/\/$/, "");
      return (/facebook\.com\/(profile\.php\?id=\d+|[\w.-]+)$/.test(base) ||
        /facebook\.com\/groups\/[\w.-]+\/user\/\d+$/.test(base)) &&
        !/(posts|permalink|hashtag|groups\/[\w.-]+\/?$|reel|videos|photos|share|messages|events)/.test(base);
    }) || null;
    const authorLink = authorLinkEl ? authorLinkEl.href : null;
    if (!authorName && authorLinkEl) {
      const t = (authorLinkEl.textContent || "").trim();
      if (t && t.length > 1 && t.length <= 60) {
        authorName = t.replace(/已认证账户|认证账户/g, "").replace(/\s+/g, " ").trim();
      }
    }
    if (!authorName) {
      const vanity = authorLink ? (authorLink.split("?")[0].replace(/\/$/, "").split("/").pop() || null) : null;
      authorName = ownAria.find(l =>
        !/(赞|评论|分享|心情|留言|浏览|播放|关注|的这篇帖子|的帖子|选项|查看|回复|位用户|个心情)/.test(l) &&
        !/(年|小时|分钟|天|周|月|刚刚)/.test(l) &&
        l.length >= 2 && l.length <= 60
      ) || vanity || null;
    }

    // text: data-ad-preview="message" -> longest dir=auto non-fragment -> strip header/trailer
    let text = null;
    const commentEls = [...main.querySelectorAll('div[role="article"]')];
    const inComment = (el) => commentEls.some((c) => c !== main && c.contains(el));
    const msgEl = main.querySelector('[data-ad-preview="message"]');
    if (msgEl && msgEl.textContent.trim()) text = dedupe(msgEl.textContent.trim());
    if (!text) {
      const dirs = [...main.querySelectorAll('div[dir="auto"]')]
        .filter(e => !inComment(e))
        .map(e => e.textContent.trim())
        .filter(t => t.length > 1 && !/^(赞|评论|回复|分享|查看原文|已认证账户|认证账户|分享对象)/.test(t) && !/^(喜欢|留言)/.test(t));
      if (dirs.length) text = dedupe(dirs.slice().sort((a, b) => b.length - a.length)[0]);
    }
    if (!text) {
      // Group posts (and some others) have no data-ad-preview / dir=auto. The message
      // follows "分享对象：{privacy}" and precedes the action bar / UI tokens.
      let remainder = textContent;
      const shareIdx = remainder.indexOf("分享对象：");
      if (shareIdx >= 0) {
        remainder = remainder.slice(shareIdx + 5);
        remainder = remainder.replace(/^[\s ]*(?:公开|好友|朋友|仅自己|私密|小组|群组)[\s ]*/, "");
        remainder = remainder.replace(/^[\s ]*(?:公开|好友|朋友|仅自己|私密|小组|群组)[\s ]*/, "").trim();
      }
      const uiIdx = remainder.search(/(查看翻译|还没有任何评论|抢沙发|写评论|赞|评论|分享|回复|查看全部)/);
      if (uiIdx > 0) remainder = remainder.slice(0, uiIdx);
      remainder = remainder.replace(/(.{25,})\1/, "$1").trim();
      if (remainder && remainder.length > 1) text = dedupe(remainder);
    }
    if (!text) text = dedupe(textContent.slice(0, 500));

    // time: absolute aria (2026年8月3日周一14:58), else relative token (6天)
    const absoluteTime = ownAria.find(l => /20\d\d年/.test(l)) || null;
    let relativeTime = null;
    const relMatch = textContent.match(/([\d.]+\s*(分钟|小时|天|周|个月|年|刚刚))/);
    if (relMatch) relativeTime = relMatch[1];
    const time = absoluteTime || relativeTime || null;

    // permalink: the post's own permalink link (/{user}/posts/{pfbid} or groups/.../permalink/), tracking stripped
    const postLink = links.find(h =>
      /facebook\.com\/([^/]+)\/posts\/pfbid|groups\/[\w-]+\/permalink\/\d+/.test(h) && h.includes("pfbid")
    ) || links.find(h => /groups\/[\w-]+\/permalink\/\d+/.test(h)) || null;
    const permalink = postLink ? postLink.split("?")[0] : location.href.split("?")[0];

    // stats
    const likeAria = ownAria.find(l => /赞：[\d,]+[\s ]*(位用户|人)/.test(l));
    let likes = null;
    if (likeAria) {
      const lm = likeAria.match(/赞：([\d,]+)/);
      if (lm) likes = parseInt(lm[1].replace(/,/g, ""), 10);
    }
    const numeric = [...main.querySelectorAll("*")]
      .filter(e => e.children.length === 0 && /^[\d,]+$/.test(e.textContent.trim()))
      .filter(e => !e.closest('div[role="article"]') || e.closest('div[role="article"]') === main)
      .map(e => e.textContent.trim().replace(/,/g, ""));
    let commentsCount = null;
    let shares = null;
    if (numeric.length >= 3) {
      commentsCount = parseInt(numeric[1], 10);
      shares = parseInt(numeric[2], 10);
    }

    // media: main post's own images only (exclude nested comment avatars and data: placeholders)
    const media = [];
    const imgs = [...main.querySelectorAll("img")].filter(i =>
      i.src && !i.src.startsWith("data:") &&
      !/emoji|static\.xx\.fbcdn\.net\/rsrc/i.test(i.src) &&
      (!i.closest('div[role="article"]') || i.closest('div[role="article"]') === main)
    );
    for (const img of imgs) {
      if (img.src) media.push({ type: "photo", url: img.src });
    }
    const video = main.querySelector("video");
    if (video) {
      if (video.poster) media.push({ type: "video", url: video.poster });
      if (video.currentSrc) media.push({ type: "video", url: video.currentSrc });
    }

    const stats = {};
    if (likes !== null) stats.likes = likes;
    if (commentsCount !== null) stats.comments = commentsCount;
    if (shares !== null) stats.shares = shares;

    return {
      post: {
        author: { name: authorName, url: authorLink ? authorLink.split("?")[0] : null },
        text,
        permalink,
        time,
        media,
        stats
      },
      mainIndex,
      matchedVia
    };
  }, inputUrlId);
}

// Video/reel/watch page readiness: returns "unavailable" | "ready" | "loading".
// - "unavailable" when Facebook renders a broken/dead-video error page.
// - "ready" when the player and the author/post header have actually rendered.
// - "loading" while the page is still settling (post header not yet visible).
async function detectVideoState(page) {
  return page.evaluate(() => {
    const body = document.body.textContent || "";
    if (/页面无法显示|内容暂时无法显示|链接可能已损坏|content temporarily unavailable|content is unavailable/i.test(body)) {
      return "unavailable";
    }
    const main = document.querySelector('[role="main"]');
    const mainText = main ? main.textContent.trim() : "";
    // Reel layout: role=main starts with "<author> · 关注".
    const reelReady = /[^\n·]{1,80}?\s*·\s*(?:关注|已关注)/.test(mainText);
    // /videos & /watch layout: the post header (follow button) renders beside the
    // player, and verified pages also expose an author heading with a badge.
    const hasFollow = [...document.querySelectorAll("div, span, a")].some(e => {
      const t = (e.textContent || "").trim();
      const aria = (e.getAttribute("aria-label") || "").trim();
      return t === "关注" || t === "已关注" || aria === "关注" || aria === "已关注";
    });
    const hasBadgeHeading = [...document.querySelectorAll("h1, h2, h3")].some(h =>
      /已认证账户|认证账户/.test(h.textContent || ""));
    const hasVideo = document.querySelectorAll("video").length > 0;
    if (reelReady || (hasFollow && hasVideo) || hasBadgeHeading) return "ready";
    return "loading";
  }).catch(() => "loading");
}

// --- main post extraction (video/reel/watch player pages) ---
async function extractVideoPost(page) {
  return page.evaluate(() => {
    // Strip verification badges / zero-width chars, normalize whitespace.
    const cleanName = (raw) => {
      if (!raw) return null;
      let s = String(raw)
        .replace(/[​‌‍﻿]/g, "")
        .replace(/\s+/g, " ")
        .replace(/\s*已认证账户/g, "")
        .replace(/\s*认证账户/g, "")
        .replace(/^[\s·]+|[\s·]+$/g, "")
        .trim();
      if (!s || s === "·" || s.length > 80) return null;
      return s;
    };
    const isSectionTitle = (t) =>
      /^(通知|评论|视频|Reels|首页|好友|小组|新通知|更早的通知|最新|为你推荐|游戏|活动|搜索|设置|直播|探索|收藏|照片|你的个人主页)/.test(t);

    const mainEl = document.querySelector('[role="main"]');
    const mainText = mainEl ? mainEl.textContent.trim() : "";
    const commentArts = [...document.querySelectorAll('div[role="article"]')];
    const inComment = (el) => commentArts.some(c => c !== mainEl && c.contains(el));

    // ---- author ----
    let author = null;
    let authorUrl = null;
    let headingEl = null;
    // 1. Reel layout: "<name> · 关注" is the START of role=main. The h2 heading can
    //    be truncated (observed: role=main carried a longer prefix than the h2), so the
    //    role=main prefix is authoritative for reels. ANCHORED only: a loose search
    //    also matches commenter follow-buttons on /watch pages where role=main
    //    includes the comment stream, which polluted the author.
    const reelAuthor = mainText.match(/^([^\n·]{1,80}?)\s*·\s*(?:关注|已关注)/);
    if (reelAuthor) author = cleanName(reelAuthor[1]);
    // 2. /videos & /watch: verified accounts render an author heading with a badge.
    if (!author) {
      for (const h of document.querySelectorAll("h1, h2, h3")) {
        const t = (h.textContent || "").trim();
        if ((t.includes("已认证账户") || t.includes("认证账户")) && !isSectionTitle(t)) {
          const name = cleanName(t);
          if (name) { author = name; headingEl = h; break; }
        }
      }
    }
    // 3. /videos & /watch: non-verified authors — the heading nearest the follow button.
    if (!author) {
      const followBtn = [...document.querySelectorAll("div, span, a")].find(e => {
        const t = (e.textContent || "").trim();
        const aria = (e.getAttribute("aria-label") || "").trim();
        return t === "关注" || t === "已关注" || aria === "关注" || aria === "已关注";
      });
      if (followBtn) {
        let p = followBtn.parentElement;
        for (let i = 0; i < 10 && p; i++) {
          const heading = p.querySelector("h1, h2, h3");
          if (heading && !isSectionTitle(heading.textContent.trim())) {
            const name = cleanName(heading.textContent.trim());
            if (name) { author = name; headingEl = heading; break; }
          }
          p = p.parentElement;
        }
      }
    }
    // 4. Author link fallback (author name may not be a heading at all).
    if (!author) {
      const link = [...document.querySelectorAll("a[href]")].find(a => {
        const base = a.href.split("?")[0].replace(/\/$/, "");
        return (/facebook\.com\/(profile\.php\?id=\d+|[\w.-]+)$/.test(base) ||
          /facebook\.com\/groups\/[\w.-]+\/user\/\d+$/.test(base)) &&
          !/(posts|permalink|hashtag|groups\/[\w.-]+\/?$|reel|videos|watch|share|messages|events|friends|notifications|photos)/.test(base);
      });
      if (link) {
        const t = (link.textContent || "").trim();
        author = cleanName(t || link.href.split("?")[0].replace(/\/$/, "").split("/").pop());
      }
    }
    // Author URL: link inside the heading, else a page/profile link matching the name.
    if (headingEl) {
      const link = headingEl.querySelector("a[href]");
      if (link) authorUrl = link.href.split("?")[0];
    }
    if (!authorUrl) {
      const want = (author || "").toLowerCase().replace(/\s+/g, "");
      const link = [...document.querySelectorAll("a[href]")].find(a => {
        const base = a.href.split("?")[0].replace(/\/$/, "");
        if (!(/facebook\.com\/(profile\.php\?id=\d+|[\w.-]+)$/.test(base) ||
          /facebook\.com\/groups\/[\w.-]+\/user\/\d+$/.test(base))) return false;
        if (/(posts|permalink|hashtag|reel|videos|watch|share|messages|friends|notifications|photos)/.test(base)) return false;
        if (!want) return false;
        const text = (a.textContent || "").trim().replace(/已认证账户|认证账户/g, "").replace(/\s+/g, "").toLowerCase();
        const vanity = decodeURIComponent(base.split("/").pop().toLowerCase());
        return text === want || vanity === want;
      });
      if (link) authorUrl = link.href.split("?")[0];
    }

    // ---- text / caption ----
    const stripUiTokens = (s) => s
      .replace(/展开隐藏翻译|隐藏翻译|查看翻译|查看原文|查看更多|查看全部|复制链接|展开翻译/g, " ")
      .replace(/[\s ]+/g, " ")
      .trim();
    const stripTrailingStats = (s) => s
      .replace(/[\s ]*(?:\d[\d\s ,.]*(?:\s*万)?)+[\s ]*$/, "")
      .trim();

    let text = null;
    if (reelAuthor) {
      // Reel caption: everything after the "· 关注" marker, minus the "{name} · 原声"
      // audio credit, UI tokens ("展开隐藏翻译" etc.) and the live stat suffix.
      let cap = mainText.slice(reelAuthor[0].length);
      cap = cap.replace(/^[^\n]{0,80}?·\s*(?:原声|原创音频)\s*/u, " ").trim();
      cap = stripUiTokens(cap);
      cap = stripTrailingStats(cap);
      cap = cap.replace(/^[：:·、\s]+|[·：:、\s]+$/g, "").trim();
      if (cap && cap.length > 1) text = cap.slice(0, 500);
    } else {
      // /watch pages render the post body caption after the "作者" badge marker.
      // The marker also appears in UI chrome, so pick the SMALLEST non-comment
      // container that still carries a real caption after it.
      const authorLabels = [...document.querySelectorAll("div")]
        .filter(e => !commentArts.some(c => c.contains(e)))
        .map(e => ({ el: e, t: (e.textContent || "").trim() }))
        .filter(({ t }) => {
          const idx = t.indexOf("作者");
          if (idx < 0) return false;
          const rest = t.slice(idx + 2).trim();
          return rest.length >= 10 && rest.length <= 800 && /[一-鿿]{2,}/.test(rest);
        })
        .sort((a, b) => a.t.length - b.t.length);
      const authorLabel = authorLabels[0];
      if (authorLabel) {
        const t = authorLabel.t;
        let cap = t.slice(t.indexOf("作者") + 2);
        cap = stripUiTokens(cap);
        cap = stripTrailingStats(cap);
        cap = cap.replace(/\s*\|\s*.*$/, "").trim();
        // A related-video title is often glued to a caption URL without a separator
        // (e.g. ".../WWW3.NHK.OR.JPToday’s Top Japan and World News"). Strip a long
        // (>=20 char) trailing ASCII-only phrase that follows the CJK caption — short
        // mixed-language caption tails ("我爱 Facebook") are preserved.
        cap = cap.replace(/([一-鿿].*?)([A-Za-z][A-Za-z0-9’' .,-]{19,})$/, "$1").trim();
        if (cap && cap.length > 1) text = cap.slice(0, 500);
      }
      // /videos pages: a description renders as a non-comment dir=auto.
      if (!text) {
        const dirs = [...document.querySelectorAll('div[dir="auto"]')]
          .filter(e => !inComment(e))
          .map(e => e.textContent.trim())
          .filter(t => t.length > 2 && !/^\d+:\d+/.test(t) &&
            !/^(赞|评论|分享|回复|关注|已关注|查看原文|播放|视频|首页|直播|Reels|探索|收藏)/.test(t));
        text = dirs.find(t => t.length <= 3000) || null;
        if (text) text = stripUiTokens(text);
      }
    }

    // ---- media ----
    const media = [];
    const vids = [...document.querySelectorAll("video")].filter(v => !inComment(v));
    for (const v of vids) {
      if (v.poster) media.push({ type: "video", url: v.poster });
      if (v.currentSrc) media.push({ type: "video", url: v.currentSrc });
    }
    if (!media.length) {
      const covers = [...document.querySelectorAll("img")].filter(i =>
        i.src && /^https:/.test(i.src) && /scontent|fbcdn/.test(i.src) &&
        !/emoji|static\.xx\.fbcdn\.net\/rsrc/i.test(i.src) &&
        (i.width >= 50 || i.naturalWidth >= 50) && !inComment(i)
      );
      const cover = covers.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
      if (cover) media.push({ type: "video", url: cover.src });
    }

    // ---- stats ----
    const stats = {};
    const allAria = [...document.querySelectorAll("[aria-label]")]
      .map(e => e.getAttribute("aria-label")).filter(Boolean);
    const likeAria = allAria.find(l => /赞：[\d,.\s万]+(?:位用户|人)/.test(l)) || null;
    if (likeAria) {
      const lm = likeAria.match(/赞：([\d,.\s万]+)/);
      if (lm) {
        let n = lm[1].replace(/,/g, "").replace(/\s+/g, "").trim();
        let mult = 1;
        if (n.endsWith("万")) { mult = 10000; n = n.replace(/万$/, ""); }
        const val = parseFloat(n);
        if (!Number.isNaN(val) && val > 0) stats.likes = Math.round(val * mult);
      }
    }

    const permalink = /\/watch\//.test(location.href)
      ? location.href
      : location.href.split("?")[0];

    return {
      post: {
        author: { name: author, url: authorUrl },
        text,
        permalink,
        time: null,
        media,
        stats
      }
    };
  });
}

// Click all [role="button"] / [role="tab"] elements whose text/aria matches a regex source.
// Returns the number of elements clicked.
async function clickByText(page, source) {
  return page.evaluate((src) => {
    const re = new RegExp(src);
    const els = [...document.querySelectorAll('[role="button"], [role="tab"]')];
    const seen = new Set();
    let count = 0;
    for (const el of els) {
      if (seen.has(el)) continue;
      const label = (el.textContent || "") + " " + (el.getAttribute("aria-label") || "");
      if (re.test(label)) {
        seen.add(el);
        try { el.click(); count += 1; } catch (_) { /* element may detach mid-loop */ }
      }
    }
    return count;
  }, source);
}

async function countComments(page, inputUrlId) {
  return page.evaluate((fallbackUrlId) => {
    const arts = [...document.querySelectorAll('div[role="article"]')];
    const nonEmpty = arts.filter(a => a.textContent.trim().length > 0);
    const urlId = (() => {
      const href = location.href;
      const g = href.match(/groups\/[\w.-]+\/permalink\/(\d+)/);
      if (g) return g[1];
      const gp = href.match(/groups\/[\w.-]+\/posts\/(\d+)/);
      if (gp) return gp[1];
      const p = href.match(/\/(?:[\w.-]+)\/posts\/(pfbid[\w]+)/);
      if (p) return p[1];
      return null;
    })() || fallbackUrlId || null;
    const urlAuthor = (() => {
      const m = location.href.match(/facebook\.com\/([\w.-]+)\/posts\//);
      return m ? m[1].toLowerCase() : null;
    })();
    const candidates = [];
    for (let i = 0; i < arts.length; i++) {
      const a = arts[i];
      if (!a.textContent.trim()) continue;
      const aria = [...a.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label")).join(" ");
      if (/分享对象：/.test(a.textContent) && /赞：/.test(aria)) candidates.push({ a, i });
    }
    const optionsAuthor = (a) => {
      const aria = [...a.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label") || "").join(" ");
      const m = aria.match(/可对(.+?)的这篇帖子执行的操作/);
      return m ? m[1].trim() : null;
    };
    let mainIndex = -1;
    let main = null;
    if (!main && urlAuthor) {
      for (const { a, i } of candidates) {
        const author = optionsAuthor(a);
        if (author && (author.toLowerCase().includes(urlAuthor) || urlAuthor.includes(author.toLowerCase()))) {
          main = a; mainIndex = i; break;
        }
      }
    }
    if (!main && urlId) {
      for (let i = 0; i < arts.length; i++) {
        const a = arts[i];
        if (!a.textContent.trim()) continue;
        if ((a.outerHTML || "").includes(urlId)) { main = a; mainIndex = i; break; }
      }
      if (!main) {
        for (const { a, i } of candidates) {
          const matches = [...a.querySelectorAll("a[href]")].some(x => x.href.includes(urlId)) ||
            (a.outerHTML || "").includes(urlId);
          if (matches && (!main || a.textContent.length > main.textContent.length)) { main = a; mainIndex = i; }
        }
      }
    }
    if (!main) {
      for (const { a, i } of candidates) {
        if (!main || a.textContent.length > main.textContent.length) { main = a; mainIndex = i; }
      }
    }
    if (mainIndex === -1) return nonEmpty.length;
    const depth = (el) => { let d = 0; let p = el; while (p && p.tagName !== "BODY") { d += 1; p = p.parentElement; } return d; };
    const mainDepth = main ? depth(main) : 0;
    let count = 0;
    for (let i = mainIndex + 1; i < arts.length; i++) {
      if (arts[i].textContent.trim() && depth(arts[i]) > mainDepth) count += 1;
    }
    return count;
  }, inputUrlId);
}

// Load comments incrementally until the limit is reached or the stream is exhausted.
async function loadComments(page, limit, inputUrlId) {
  let stall = 0;
  for (let iter = 0; iter < 30; iter += 1) {
    const before = await countComments(page, inputUrlId);
    if (before >= limit) break;
    // expand reply threads first
    const expandedReplies = await clickByText(page, "查看\\d+条回复|查看更多回复|\\d+条回复");
    await waitRandom(350, 700);
    // load more comments
    const clickedMore = await clickByText(page, "查看更多评论");
    if (clickedMore > 0) await waitRandom(500, 1000);
    const after = await countComments(page);
    if (after === before && clickedMore === 0 && expandedReplies === 0) {
      stall += 1;
      if (stall >= 3) break;
    } else {
      stall = 0;
    }
    if (after >= limit) break;
  }
}

// Enumerate comments and structure them into top-level comments with replies.
async function readComments(page, limit, inputUrlId) {
  return page.evaluate((args) => {
    const max = args.max;
    const fallbackUrlId = args.fallbackUrlId;
    const arts = [...document.querySelectorAll('div[role="article"]')];
    const depth = (el) => { let d = 0; let p = el; while (p && p.tagName !== "BODY") { d += 1; p = p.parentElement; } return d; };

    // identify main post (standard pages) and its index; prefer the article that
    // matches the URL post id (sidebar suggestions vary per load).
    const urlId = (() => {
      const href = location.href;
      const g = href.match(/groups\/[\w.-]+\/permalink\/(\d+)/);
      if (g) return g[1];
      const gp = href.match(/groups\/[\w.-]+\/posts\/(\d+)/);
      if (gp) return gp[1];
      const p = href.match(/\/(?:[\w.-]+)\/posts\/(pfbid[\w]+)/);
      if (p) return p[1];
      const php = href.match(/permalink\.php\?[^#]*story_fbid=([^&]+)/);
      if (php) return decodeURIComponent(php[1]);
      return null;
    })() || fallbackUrlId || null;
    const urlAuthor = (() => {
      const m = location.href.match(/facebook\.com\/([\w.-]+)\/posts\//);
      return m ? m[1].toLowerCase() : null;
    })();
    const candidates = [];
    for (let i = 0; i < arts.length; i++) {
      const a = arts[i];
      if (!a.textContent.trim()) continue;
      const aria = [...a.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label")).join(" ");
      if (/分享对象：/.test(a.textContent) && /赞：/.test(aria)) candidates.push({ a, i });
    }
    const optionsAuthor = (a) => {
      const aria = [...a.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label") || "").join(" ");
      const m = aria.match(/可对(.+?)的这篇帖子执行的操作/);
      return m ? m[1].trim() : null;
    };
    let mainIndex = -1;
    let main = null;
    if (!main && urlAuthor) {
      for (const { a, i } of candidates) {
        const author = optionsAuthor(a);
        if (author && (author.toLowerCase().includes(urlAuthor) || urlAuthor.includes(author.toLowerCase()))) {
          main = a; mainIndex = i; break;
        }
      }
    }
    if (!main && urlId) {
      for (let i = 0; i < arts.length; i++) {
        const a = arts[i];
        if (!a.textContent.trim()) continue;
        if ((a.outerHTML || "").includes(urlId)) { main = a; mainIndex = i; break; }
      }
      if (!main) {
        for (const { a, i } of candidates) {
          const matches = [...a.querySelectorAll("a[href]")].some(x => x.href.includes(urlId)) ||
            (a.outerHTML || "").includes(urlId);
          if (matches && (!main || a.textContent.length > main.textContent.length)) { main = a; mainIndex = i; }
        }
      }
    }
    if (!main) {
      for (const { a, i } of candidates) {
        if (!main || a.textContent.length > main.textContent.length) { main = a; mainIndex = i; }
      }
    }

    // candidate comments: articles after main that are nested deeper than the main post
    // (the comment section lives inside the main article's subtree; a shallow "recommended
    // posts" block can also render as role=article below the comments and must be excluded).
    const commentEls = [];
    if (mainIndex >= 0) {
      const mainDepth = main ? depth(main) : 0;
      for (let i = mainIndex + 1; i < arts.length; i++) {
        const a = arts[i];
        if (!a.textContent.trim()) continue;
        if (depth(a) > mainDepth) commentEls.push(a);
      }
    } else {
      for (const a of arts) if (a.textContent.trim()) commentEls.push(a);
    }

    const parseComment = (el) => {
      const raw = el.textContent.trim();
      const sepIdx = raw.indexOf("·");
      let name = sepIdx > 0 ? raw.slice(0, sepIdx).trim() : null;
      if (name) name = name.replace(/已认证账户|认证账户/g, "").replace(/·?\s*粉丝$/, "").trim();
      const links = [...el.querySelectorAll("a[href]")].map(a => a.href);
      const authorUrl = links.find(h =>
        /facebook\.com\/(profile\.php\?id=\d+|[\w.-]+)\/?$/.test(h) &&
        !/(posts|permalink|hashtag|groups|reel|videos|photos|share|messages)/.test(h)
      ) || null;
      const dirEl = el.querySelector('div[dir="auto"]');
      const text = dirEl && dirEl.textContent.trim() ? dirEl.textContent.trim() : null;
      const aria = [...el.querySelectorAll("[aria-label]")].map(e => e.getAttribute("aria-label")).filter(Boolean);
      const time = aria.find(l => /20\d\d年/.test(l)) || null;
      let likes = null;
      const likeAria = aria.find(l => /个心情|位用户/.test(l));
      if (likeAria) {
        const lm = likeAria.match(/([\d,]+)/);
        if (lm) likes = parseInt(lm[1].replace(/,/g, ""), 10);
      }
      return {
        author: { name, url: authorUrl ? authorUrl.split("?")[0] : null },
        text,
        time,
        likes
      };
    };

    const withDepth = commentEls.map(el => ({ el, d: depth(el) }));
    const minDepth = withDepth.length ? Math.min(...withDepth.map(x => x.d)) : 0;

    const comments = [];
    let current = null;
    for (const item of withDepth) {
      const parsed = parseComment(item.el);
      if (!parsed.text && !parsed.author.name) continue;
      if (item.d <= minDepth + 1) {
        current = { ...parsed, replies: [] };
        comments.push(current);
      } else if (current) {
        current.replies.push(parsed);
      } else {
        current = { ...parsed, replies: [] };
        comments.push(current);
      }
    }

    // Trim to limit counting each top-level comment and its replies toward the budget.
    const result = [];
    let budget = max;
    for (const c of comments) {
      if (budget <= 0) break;
      budget -= 1;
      const replies = [];
      for (const r of c.replies) {
        if (budget <= 0) break;
        replies.push(r);
        budget -= 1;
      }
      result.push({ ...c, replies });
    }

    return { comments: result, totalSeen: withDepth.length };
  }, { max: limit, fallbackUrlId: inputUrlId });
}

export default async (page, params, cwd) => {
  const url = normalizeUrl(params.url);
  const includeComments = String(params.include_comments) !== "false";
  const commentLimit = parseCommentLimit(params.comment_limit);
  const isVideo = /\/videos\/\d+|\/reel\/\d+|\/watch\/?\?.*v=\d+/i.test(url);
  // Post identity parsed from the INPUT url. location.href can still be the group
  // feed (a /groups/{id}/ URL) when the post page is settling, so this id is the
  // reliable anchor for matching the target article.
  const inputUrlId = urlIdFromString(url);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitRandom(900, 1700);

  // Video/reel/watch pages render the player and post header lazily. The ready-check
  // must wait for the AUTHOR/POST HEADER to actually render (not merely for role=main
  // to have any >5-char text — the dead-video error page and the bare player clock
  // both match that old check and yielded empty success). Dead/broken video URLs are
  // detected first and fail as NOT_FOUND.
  if (isVideo) {
    let vState = "loading";
    for (let i = 0; i < 15; i += 1) {
      vState = await detectVideoState(page);
      if (vState === "unavailable" || vState === "ready") break;
      await waitRandom(900, 1400);
    }
    if (vState === "unavailable") {
      fail("NOT_FOUND", "Video content is unavailable (deleted, private, or the link is broken)");
    }
    if (vState !== "ready") {
      fail("DRIFT_DETECTED", "Video player or author content did not render — page structure may have changed");
    }
    // Fixed settle so the caption / live stats finish rendering before extraction
    // (keeps same-URL runs consistent instead of sampling mid-render).
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  const state = await detectState(page);
  if (state === "unavailable") {
    fail("NOT_FOUND", "Post content is unavailable (deleted, private, or the sharing audience changed)");
  }
  if (state === "auth") {
    fail("AUTH_REQUIRED", "Facebook login is required to view this post");
  }
  if (state === "unknown") {
    fail("DRIFT_DETECTED", "No post article found on the page — page structure may have changed");
  }

  // For GROUP post URLs carrying an id, wait until the post page settles on the
  // target article. Facebook renders the group feed first and only then routes to
  // the post page; extracting from the feed yields a wrong/sidebar article and is
  // non-deterministic (the feed's sidebar suggestions change every load).
  const isGroupPost = /groups\/[\w.-]+\/(posts|permalink)\//.test(url);
  if (inputUrlId && !isVideo && isGroupPost) {
    for (let i = 0; i < 15; i += 1) {
      const ready = await page.evaluate((pid) => {
        const href = location.href;
        const inPostUrl = /groups\/[\w.-]+\/(posts|permalink)\/\d+/.test(href) ||
          /\/(?:[\w.-]+)\/posts\/(pfbid[\w]+)/.test(href) ||
          /permalink\.php\?/.test(href);
        const hasArticle = [...document.querySelectorAll('div[role="article"]')]
          .some(a => a.textContent.trim() && (a.outerHTML || "").includes(pid));
        return inPostUrl && hasArticle;
      }, inputUrlId).catch(() => false);
      if (ready) break;
      await waitRandom(700, 1100);
    }
  }

  // Reel pages hide comments behind a "评论" button; open the panel first.
  if (includeComments && /\/reel\/\d+/.test(url)) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[aria-label="评论"]')].find(e => /^\d+$/.test(e.textContent.trim()));
      if (btn) btn.click();
    });
    await waitRandom(600, 1100);
  }

  let post;
  if (isVideo) {
    const result = await extractVideoPost(page);
    post = result.post;
    // A genuinely empty video post (no author, no caption, no media) means the page
    // did not resolve to a playable video — report NOT_FOUND instead of an empty success.
    if (!post.author.name && !post.text && post.media.length === 0) {
      fail("NOT_FOUND", "Video content could not be extracted — the video may be unavailable or the page structure changed");
    }
  } else {
    const result = await extractStandardPost(page, inputUrlId);
    if (result.notFound) {
      fail("NOT_FOUND", "The post could not be found — the URL did not resolve to a post on Facebook");
    }
    // When Facebook cannot open a post URL it sometimes renders the home feed instead;
    // such a page has a generic title ("(1) Facebook") and the "main post" was only
    // matched by id (a feed card), not by the URL author. Treat that as not-found.
    if (result.matchedVia !== "author") {
      const title = await page.title().catch(() => "");
      if (/^\(\d+\)\s*Facebook$|^Facebook$/.test(title.trim())) {
        fail("NOT_FOUND", "The post could not be found — the URL resolved to the Facebook feed instead of the post page");
      }
    }
    post = result.post;
  }
  if (!post) {
    fail("DRIFT_DETECTED", "Could not locate the post on the page — structure may have changed");
  }

  if (includeComments) {
    // Comments render slightly after the main post; wait for at least one to appear
    // before counting/paging, otherwise the initial count may read 0/1.
    for (let i = 0; i < 10; i += 1) {
      const cnt = await countComments(page, inputUrlId);
      if (cnt > 0) break;
      await waitRandom(600, 1000);
    }
    await loadComments(page, commentLimit, inputUrlId);
    const read = await readComments(page, commentLimit, inputUrlId);
    post.comments = read.comments;
    post.partial = read.totalSeen >= commentLimit;
  }

  return post;
};
