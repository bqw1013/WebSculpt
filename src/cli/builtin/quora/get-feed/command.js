// Quora home / following feed extractor.
// Primary source: GraphQL MultifeedQuery (home_page only).
// Fallback source: DOM bundle containers when GraphQL fails or for following tab.

const MAX_LIMIT = 100;
const PAGE_SIZE = 8; // MultifeedQuery returns bundles in chunks of 8.
const MULTIFEED_HASH = "86ca248542a7f425d2f862f38cb27383cae77a9c91aa8d50b890b022941f26bf";
const TABS = new Set(["home", "following"]);
const SKIP_BUNDLES = new Set([
  "BrandSafetyAdBundle",
  "PromotedAnswerFeedStory",
  "AskQuestionPromptBundle",
]);

function fail(code, message) {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  throw error;
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function absoluteUrl(value) {
  if (!value) return null;
  try {
    return new URL(value, "https://www.quora.com").toString();
  } catch {
    return null;
  }
}

// Quora qtext objects may be plain objects, JSON strings, or arrays of paragraphs.
function qtextText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // MultifeedQuery sometimes serializes qtext as a JSON string.
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") return qtextText(parsed);
    } catch {
      // Intentionally ignore: value is a plain string.
    }
    return trimmed;
  }
  if (Array.isArray(value)) {
    return value.map(qtextText).filter(Boolean).join("\n") || null;
  }
  if (Array.isArray(value.sections)) {
    return value.sections.map(qtextText).filter(Boolean).join("\n") || null;
  }
  if (Array.isArray(value.spans)) {
    return value.spans.map((span) => span?.text || qtextText(span?.modifiers?.embed)).filter(Boolean).join("") || null;
  }
  if (typeof value.text === "string") {
    return value.text.trim() || null;
  }
  return null;
}

function userName(user) {
  if (!user) return null;
  if (Array.isArray(user.names)) {
    return user.names
      .map((name) => [name?.givenName, name?.familyName].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(" ") || null;
  }
  return null;
}

function authorSummary(user) {
  if (!user) return null;
  return {
    name: userName(user),
    profileUrl: absoluteUrl(user.profileUrl),
  };
}

function parseUpvote(text) {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/([0-9]+\.?[0-9]*)([KMB]?)/i);
  if (!m) return null;
  let num = parseFloat(m[1]);
  const suffix = (m[2] || "").toUpperCase();
  if (suffix === "K") num *= 1000;
  if (suffix === "M") num *= 1000000;
  if (suffix === "B") num *= 1000000000;
  return Math.floor(num);
}

function normalizeAnswer(answer) {
  if (!answer) return null;
  const question = answer.question || {};
  return {
    type: "answer",
    id: String(answer.aid ?? answer.id ?? ""),
    url: absoluteUrl(answer.url),
    title: qtextText(question.title),
    excerpt: qtextText(answer.content)?.slice(0, 360) || null,
    author: authorSummary(answer.author),
    source: null,
    publishedAt: answer.creationTime ?? null,
    upvoteCount: answer.numUpvotes ?? null,
    commentCount: answer.numDisplayComments ?? null,
    question: {
      qid: question.qid ?? null,
      title: qtextText(question.title),
      url: absoluteUrl(question.url),
    },
  };
}

function normalizeQuestion(question) {
  if (!question) return null;
  return {
    type: "question",
    id: String(question.qid ?? question.id ?? ""),
    url: absoluteUrl(question.url),
    title: qtextText(question.title),
    excerpt: null,
    author: authorSummary(question.asker),
    source: null,
    answerCount: question.answerCount ?? null,
  };
}

function normalizePost(post) {
  if (!post) return null;
  const tribe = post.tribe || post.tribeItem?.tribe || null;
  const title = qtextText(post.title) || qtextText(post.content)?.split("\n")[0] || null;

  // Some Space posts don't include tribe.url; derive it from the post URL subdomain.
  let spaceUrl = absoluteUrl(tribe?.url);
  if (tribe && !spaceUrl && post.url) {
    try {
      const postUrl = new URL(post.url, "https://www.quora.com");
      if (postUrl.hostname !== "www.quora.com" && postUrl.hostname.endsWith(".quora.com")) {
        spaceUrl = `${postUrl.protocol}//${postUrl.hostname}/`;
      }
    } catch {
      // Ignore parse failures.
    }
  }

  return {
    type: "post",
    id: String(post.pid ?? post.id ?? ""),
    url: absoluteUrl(post.url),
    title,
    excerpt: qtextText(post.content)?.slice(0, 360) || null,
    author: authorSummary(post.author || post.tribeItem?.author),
    source: tribe ? { space: { name: tribe.nameString || null, url: spaceUrl } } : null,
    publishedAt: post.creationTime ?? null,
    upvoteCount: post.numUpvotes ?? null,
    commentCount: post.numDisplayComments ?? null,
  };
}

function bundleTypeFromClass(className) {
  const m = className?.match(/dom_annotate_multifeed_bundle_([^\s]+)/);
  return m ? m[1] : null;
}

function isLoginPage(bodyText) {
  const lower = (bodyText || "").toLowerCase();
  return /log\s*in\s*to\s*quora|sign\s*up\s*for\s*quora|add question/i.test(lower) === false &&
    /(log\s*in|sign\s*up).*quora/i.test(lower);
}

function isBlocked(bodyText) {
  const lower = (bodyText || "").toLowerCase();
  return /verify you are human|checking your browser|cf-chl-|turnstile challenge|429|too many requests/i.test(lower);
}

// Light polite pacing: random mouse move and occasional wheel.
async function lightHumanize(page, scroll = false) {
  try {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (page.mouse && viewport.width > 0 && viewport.height > 0) {
      await page.mouse.move(
        Math.floor(viewport.width * (0.35 + Math.random() * 0.3)),
        Math.floor(viewport.height * (0.2 + Math.random() * 0.35)),
        { steps: randomBetween(2, 4) }
      );
      if (scroll && typeof page.mouse.wheel === "function") {
        await page.mouse.wheel(0, randomBetween(80, 180));
      }
    }
  } catch {
    // Best effort only; extraction must remain deterministic.
  }
}

async function readMultifeed(page, variables) {
  return page.evaluate(async (payload) => {
    const globals = window.ansFrontendGlobals || {};
    const early = globals.earlySettings || {};
    const settings = globals.settings || {};
    const headers = {
      "content-type": "application/json",
      "quora-formkey": early.formkey || "",
      "quora-revision": settings.revision || "",
      "quora-canary-revision": "false",
      "quora-window-id": early.windowId || "",
      "quora-broadcast-id": settings.broadcastId || "",
    };
    const result = await fetch("/graphql/gql_para_POST?q=MultifeedQuery", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        queryName: "MultifeedQuery",
        variables: payload.variables,
        extensions: { hash: payload.hash },
      }),
    });
    return { status: result.status, body: await result.text() };
  }, { variables, hash: MULTIFEED_HASH });
}

async function fetchHomeFeed(page, limit) {
  const items = [];
  let after = null;
  let numBundlesOnClient = 0;
  let pagesFetched = 0;
  let hasNextPage = true;
  let apiFailure = null;

  try {
    while (hasNextPage && items.length < limit) {
      const variables = {
        first: PAGE_SIZE,
        multifeedAfter: after,
        multifeedNumBundlesOnClient: numBundlesOnClient,
        injectionType: null,
        injectionData: null,
        filterStoryType: null,
        filterStoryOid: null,
        multifeedPage: "home_page",
        pageData: 0,
        showLiveBanner: false,
      };

      const response = await readMultifeed(page, variables);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`GraphQL HTTP ${response.status}`);
      }

      let body;
      try {
        body = JSON.parse(response.body);
      } catch {
        throw new Error("invalid GraphQL JSON");
      }

      if (Array.isArray(body.errors) && body.errors.length) {
        throw new Error(body.errors.map((e) => e.message || "GraphQL error").join("; "));
      }

      const connection = body.data?.multifeedObject?.multifeedConnection;
      if (!connection || !Array.isArray(connection.edges)) {
        throw new Error("MultifeedQuery schema missing");
      }

      pagesFetched += 1;
      const edges = connection.edges;
      hasNextPage = connection.pageInfo?.hasNextPage ?? false;
      after = connection.pageInfo?.endCursor ?? null;
      numBundlesOnClient += edges.length;

      for (const edge of edges) {
        const bundle = edge?.node;
        if (!bundle) continue;
        const type = bundle.__typename;
        if (SKIP_BUNDLES.has(type)) continue;

        if (type === "AnswersBundle" && bundle.bundleConnection) {
          const storyEdge = bundle.bundleConnection.edges?.[0];
          const answer = storyEdge?.node?.answer;
          if (answer) {
            items.push(normalizeAnswer(answer));
          }
        } else if (type === "PostBundle" && Array.isArray(bundle.stories)) {
          for (const story of bundle.stories) {
            if (story?.post) items.push(normalizePost(story.post));
          }
        } else if (type === "QuestionsBundle" && Array.isArray(bundle.stories)) {
          for (const story of bundle.stories) {
            if (story?.question) items.push(normalizeQuestion(story.question));
          }
        }

        if (items.length >= limit) break;
      }

      if (!edges.length) break;
      if (!hasNextPage) break;
    }
  } catch (error) {
    apiFailure = error instanceof Error ? error.message : String(error);
  }

  return { items: items.slice(0, limit), pagesFetched, apiFailure, partial: hasNextPage };
}

async function extractFromDom(page, url, limit) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(randomBetween(500, 900));
  await lightHumanize(page);

  const bodyText = await page.evaluate(() => document.body?.innerText || "");
  if (isBlocked(bodyText)) {
    fail("DRIFT_DETECTED", "Quora page is blocked by a challenge or rate limit");
  }

  const records = await page.evaluate(({ max }) => {
    const absolute = (href) => {
      try {
        return href ? new URL(href, location.origin).toString() : null;
      } catch {
        return null;
      }
    };

    const lines = (node) =>
      (node?.innerText || node?.textContent || "")
        .split(/\r?\n+/)
        .map((v) => v.trim())
        .filter(Boolean);

    const parseUpvote = (text) => {
      const m = text?.replace(/,/g, "").match(/([0-9]+\.?[0-9]*)([KMB]?)/i);
      if (!m) return null;
      let num = parseFloat(m[1]);
      const suffix = (m[2] || "").toUpperCase();
      if (suffix === "K") num *= 1000;
      if (suffix === "M") num *= 1000000;
      if (suffix === "B") num *= 1000000000;
      return Math.floor(num);
    };

    const records = [];
    const seen = new Set();
    const add = (key, record) => {
      if (!key || seen.has(key) || records.length >= max) return;
      seen.add(key);
      records.push(record);
    };

    const authorFrom = (card) => {
      const link = [...card.querySelectorAll("a[href]")].find((a) =>
        a.getAttribute("href")?.startsWith("/profile/")
      );
      return link
        ? { name: link.innerText.trim() || null, profileUrl: absolute(link.getAttribute("href")) }
        : null;
    };

    const spaceFrom = (card) => {
      const link = [...card.querySelectorAll("a[href]")].find((a) => {
        let url;
        try {
          url = new URL(a.href);
        } catch {
          return false;
        }
        return url.hostname.endsWith(".quora.com") && url.hostname !== "www.quora.com";
      });
      return link
        ? { name: link.innerText.trim() || null, url: absolute(link.getAttribute("href")) }
        : null;
    };

    const bundleType = (card) => {
      const m = card.className.match(/dom_annotate_multifeed_bundle_([^\s]+)/);
      return m ? m[1] : null;
    };

    const extractAnswer = (card) => {
      const title = card.querySelector(".puppeteer_test_question_title")?.innerText?.trim() || null;
      const content = card.querySelector(".puppeteer_test_answer_content")?.innerText?.trim() || null;
      const upvoteText = card.querySelector(".puppeteer_test_votable_upvote_button")?.innerText?.trim() || null;
      const author = authorFrom(card);
      const cardLinks = [...card.querySelectorAll("a[href]")];
      const answerLink = cardLinks.find((a) => a.href.includes("/answer/"));
      const questionLink = cardLinks.find(
        (a) => !a.href.includes("/profile/") && !a.href.includes("/answer/") && !a.href.includes("/topic/") && /^\/[^/]+$/.test(new URL(a.href, location.origin).pathname)
      );
      const url = absolute(answerLink?.getAttribute("href") || questionLink?.getAttribute("href"));
      add(`answer:${url || title}`, {
        type: "answer",
        id: null,
        url,
        title,
        excerpt: content ? content.slice(0, 360) : null,
        author,
        source: null,
        publishedAt: null,
        upvoteCount: parseUpvote(upvoteText),
        commentCount: null,
        question: questionLink
          ? { qid: null, title, url: absolute(questionLink.getAttribute("href")) }
          : null,
      });
    };

    const extractPost = (card) => {
      const postCard = card.querySelector(".puppeteer_test_tribe_post_item_feed_story") || card;
      const space = spaceFrom(postCard);
      const author = authorFrom(postCard);
      const upvoteText = postCard.querySelector(".puppeteer_test_votable_upvote_button")?.innerText?.trim() || null;
      const cardLines = lines(postCard);
      const title = cardLines[0] || null;
      const content = cardLines.slice(1).join("\n") || null;
      const links = [...postCard.querySelectorAll("a[href]")];
      const url = absolute(
        links.find((a) => {
          const h = a.getAttribute("href") || "";
          return !h.startsWith("/profile/") && !h.startsWith("/topic/") && h !== "/";
        })?.getAttribute("href")
      );
      add(`post:${url || title}`, {
        type: "post",
        id: null,
        url,
        title,
        excerpt: content ? content.slice(0, 360) : null,
        author,
        source: space ? { space } : null,
        publishedAt: null,
        upvoteCount: parseUpvote(upvoteText),
        commentCount: null,
      });
    };

    const extractQuestion = (card) => {
      const title = card.querySelector(".puppeteer_test_question_title")?.innerText?.trim() || null;
      const link = [...card.querySelectorAll("a[href]")].find((a) =>
        /^\/[^/]+$/.test(new URL(a.href, location.origin).pathname)
      );
      const text = card.innerText || "";
      const answerMatch = text.match(/([\d,.]+)\s+answers?/i);
      add(`question:${link?.href || title}`, {
        type: "question",
        id: null,
        url: absolute(link?.getAttribute("href")),
        title,
        excerpt: null,
        author: null,
        source: null,
        answerCount: answerMatch ? parseUpvote(answerMatch[1]) : null,
      });
    };

    const extractBundle = (card) => {
      const type = bundleType(card);
      if (!type || ["BrandSafetyAdBundle", "PromotedAnswerFeedStory", "AskQuestionPromptBundle"].includes(type)) {
        return;
      }
      if (type === "AnswersBundle") extractAnswer(card);
      else if (type === "PostBundle") extractPost(card);
      else if (type === "QuestionsBundle") extractQuestion(card);
    };

    for (let pass = 0; pass < 8 && records.length < max; pass += 1) {
      for (const card of document.querySelectorAll("[class*='dom_annotate_multifeed_bundle_']")) {
        extractBundle(card);
        if (records.length >= max) break;
      }
      if (records.length >= max) break;
      const before = document.body.scrollHeight;
      window.scrollBy(0, Math.max(500, Math.floor(window.innerHeight * 0.8)));
      // eslint-disable-next-line no-undef
      const start = Date.now();
      while (Date.now() - start < 400 + Math.floor(Math.random() * 300)) {
        // Small busy-wait-like delay to mimic reading time without setTimeout in page context.
      }
      const atEnd = window.scrollY + window.innerHeight >= document.body.scrollHeight - 8;
      if (atEnd && document.body.scrollHeight === before) break;
    }

    const bodyLower = (document.body?.innerText || "").toLowerCase();
    const blocked = /verify you are human|checking your browser|cf-chl-|turnstile challenge|429|too many requests/.test(bodyLower);
    return { records: records.slice(0, max), blocked };
  }, { max: limit });

  if (records.blocked) {
    fail("DRIFT_DETECTED", "Quora DOM extraction hit a challenge or rate limit");
  }

  return records.records;
}

async function detectAuth(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(randomBetween(400, 800));
  await lightHumanize(page);

  const info = await page.evaluate(() => ({
    hasLoginLink: !!document.querySelector('a[href*="/login"]'),
    hasSignupLink: !!document.querySelector('a[href*="/signup"]'),
    hasFeedSwitcher: !!document.querySelector(".dom_annotate_feed_switcher, .dom_annotate_multifeed_home"),
    hasFeedBundle: !!document.querySelector("[class*='dom_annotate_multifeed_bundle_']"),
    bodyText: document.body?.innerText?.slice(0, 400) || "",
  }));

  if (isBlocked(info.bodyText)) {
    fail("DRIFT_DETECTED", "Quora blocked the request with a challenge");
  }

  // If the page shows explicit login UI and no feed structure, treat as unauthenticated.
  if ((info.hasLoginLink || info.hasSignupLink) && !info.hasFeedSwitcher && !info.hasFeedBundle) {
    fail("AUTH_REQUIRED", "A logged-in Quora session is required to read the feed");
  }

  return info;
}

export default async (page, params, cwd) => {
  const tab = params.tab;
  if (!TABS.has(tab)) {
    fail("INVALID_PARAM", `tab must be one of ${[...TABS].join(", ")}`);
  }

  const rawLimit = params.limit === undefined || params.limit === null ? "" : String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > MAX_LIMIT) {
    fail("INVALID_PARAM", `limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  const limit = Number(rawLimit);

  const url = tab === "home" ? "https://www.quora.com/" : "https://www.quora.com/following";

  // Verify login / detect blocks before committing to extraction.
  await detectAuth(page, url);

  let items = [];
  let source = "api";
  let fallbackUsed = false;
  let fallbackReason = null;
  let pagesFetched = 0;
  let partial = false;

  if (tab === "home") {
    const homeResult = await fetchHomeFeed(page, limit);
    items = homeResult.items;
    pagesFetched = homeResult.pagesFetched;
    partial = homeResult.partial && items.length < limit;

    if (!items.length && homeResult.apiFailure) {
      fallbackReason = homeResult.apiFailure;
      source = "dom";
      fallbackUsed = true;
      items = await extractFromDom(page, url, limit);
      partial = items.length < limit;
    }
  } else {
    // following tab: use DOM extraction because the GraphQL path for populated following feeds
    // was not verified during exploration.
    source = "dom";
    fallbackUsed = true;
    fallbackReason = "following GraphQL path not verified; using DOM fallback";
    items = await extractFromDom(page, url, limit);
    partial = items.length < limit;
  }

  if (!items.length) {
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    const isEmptyFollowing = tab === "following" && /build your new following feed/i.test(bodyText);
    if (isEmptyFollowing) {
      // Valid empty state for an account with no follows.
      return { tab, limit, items: [], itemCount: 0, partial: true, pagesFetched, source, fallbackUsed, fallbackReason };
    }
    fail("EMPTY_RESULT", "No feed items could be extracted");
  }

  await page.waitForTimeout(randomBetween(0, 300));

  return {
    tab,
    limit,
    items: items.slice(0, limit),
    itemCount: Math.min(items.length, limit),
    partial,
    pagesFetched,
    source,
    fallbackUsed,
    fallbackReason,
  };
};
