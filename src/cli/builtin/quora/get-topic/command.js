const MAX_LIMIT = 100;
const PAGE_SIZE = 10;
const PAGE_CAP = 12;
const SECTIONS = new Set(["read", "top_questions", "writers"]);

const READ_INITIAL_HASH = "85e2a43cffae3fe630b779b96720448232e9c751e94f89021fdb548d63e0aa26";
const WRITE_INITIAL_HASH = "b2540a442dabbfd0f8f4636823cfe277ff1a5c1a52408c6090ece6860e46bc16";
const MULTIFEED_HASH = "86ca248542a7f425d2f862f38cb27383cae77a9c91aa8d50b890b022941f26bf";

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

function qtextText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") return qtextText(parsed);
    } catch { /* Quora often sends plain strings for short fields. */ }
    return trimmed;
  }
  if (Array.isArray(value)) return value.map(qtextText).filter(Boolean).join("\n") || null;
  if (Array.isArray(value.sections)) return value.sections.map(qtextText).filter(Boolean).join("\n") || null;
  if (Array.isArray(value.spans)) return value.spans.map(span => span?.text || qtextText(span?.modifiers?.embed)).filter(Boolean).join("") || null;
  if (typeof value.text === "string") return value.text.trim() || null;
  return null;
}

function userName(user) {
  if (!user) return null;
  if (Array.isArray(user.names)) {
    return user.names
      .map(name => [name?.givenName, name?.familyName].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(" ") || null;
  }
  return null;
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").replace(/\s+/g, "").toLowerCase();
  const multipliers = { k: 1e3, m: 1e6, b: 1e9 };
  const match = normalized.match(/^([\d.]+)([kmb]?)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  if (Number.isNaN(num)) return null;
  return Math.floor(num * (multipliers[suffix] || 1));
}

function parseFollowerText(text) {
  if (!text) return null;
  const match = String(text).match(/([\d.,]+\s*[KMB]?)\s*followers/i);
  return match ? parseNumber(match[1]) : null;
}

async function lightHumanize(page, scroll = false) {
  try {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (viewport.width > 0 && viewport.height > 0) {
      const x = Math.floor(viewport.width * (0.35 + Math.random() * 0.3));
      const y = Math.floor(viewport.height * (0.2 + Math.random() * 0.35));
      await page.mouse.move(x, y, { steps: randomBetween(2, 4) });
      if (scroll && typeof page.mouse.wheel === "function") {
        await page.mouse.wheel(0, randomBetween(80, 180));
      }
    }
  } catch { /* best effort; extraction must remain deterministic. */ }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function topicUrl(slug, section) {
  const base = `https://www.quora.com/topic/${slug}`;
  if (section === "top_questions") return `${base}/top_questions`;
  if (section === "writers") return `${base}/writers`;
  return base;
}

async function readTid(page) {
  return page.evaluate(() => {
    const globals = window.ansFrontendGlobals || {};
    return (
      globals.earlySettings?.rootQueryVariables?.tid ??
      globals.earlySettings?.rootProps?.tid ??
      globals.settings?.inlinedQueryVariables?.TopicPageLoadableQuery?.tid ??
      null
    );
  });
}

async function readTopicMetadata(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const name = h1?.innerText?.trim() || null;

    // The header area contains the topic name, a Follow/Following button, a dot separator,
    // and a follower count like "156M" (without the word "followers").
    // Find the smallest ancestor of h1 that also contains "Following" or "Follow".
    let headerContainer = null;
    let current = h1;
    for (let depth = 0; current && depth < 10; depth += 1) {
      const text = current.innerText || "";
      if (/\b(Following|Follow)\b/.test(text)) {
        headerContainer = current;
        break;
      }
      current = current.parentElement;
    }

    let followerCount = null;
    if (headerContainer) {
      const text = headerContainer.innerText || "";
      // Look for "Following · 156M" or "Follow · 156M" or just "Following 156M"
      const match = text.match(/(?:Following|Follow)\s*[·\s]\s*([\d.,]+\s*[KMB]?)/i);
      if (match) followerCount = match[1];
    }

    // Fallback: search ancestors of h1 for any follower text.
    if (!followerCount) {
      current = h1;
      for (let depth = 0; current && depth < 6 && !followerCount; depth += 1) {
        const match = (current.innerText || "").match(/([\d.,]+\s*[KMB]?)\s*followers/i);
        if (match) followerCount = match[1];
        current = current.parentElement;
      }
    }

    // Final fallback: look anywhere.
    if (!followerCount) {
      const all = [...document.querySelectorAll("*")];
      for (const el of all) {
        const text = el.innerText || "";
        const match = text.match(/([\d.,]+\s*[KMB]?)\s*followers/i);
        if (match) {
          followerCount = match[1];
          break;
        }
      }
    }

    return { name, followerCount };
  });
}

async function isNotFound(page) {
  return page.evaluate(() => {
    const url = location.href;
    const bodyText = (document.body?.innerText || "").toLowerCase();
    return (
      !url.includes("/topic/") ||
      bodyText.includes("page not found") ||
      bodyText.includes("couldn't find the page")
    );
  });
}

async function callGraphQL(page, queryName, variables, hash) {
  const response = await page.evaluate(async payload => {
    const globals = window.ansFrontendGlobals || {};
    const early = globals.earlySettings || {};
    const settings = globals.settings || {};
    const headers = {
      "content-type": "application/json",
      "quora-formkey": early.formkey || "",
      "quora-revision": settings.revision || "",
      "quora-canary-revision": "false",
      "quora-window-id": early.windowId || "",
      "quora-broadcast-id": settings.broadcastId || ""
    };
    const result = await fetch(`/graphql/gql_para_POST?q=${payload.queryName}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        queryName: payload.queryName,
        variables: payload.variables,
        extensions: { hash: payload.hash }
      })
    });
    return { status: result.status, body: await result.text() };
  }, { queryName, variables, hash });

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
    throw new Error(body.errors.map(item => item.message || "GraphQL error").join("; "));
  }
  return body;
}

function normalizeAnswerStory(story) {
  const answer = story.answer || {};
  const question = answer.question || {};
  const author = answer.author || {};
  return {
    type: "answer",
    id: String(answer.aid ?? answer.oid ?? answer.id ?? ""),
    url: absoluteUrl(answer.permaUrl || answer.url),
    title: qtextText(question.title),
    excerpt: qtextText(answer.content),
    publishedAt: answer.creationTime ?? null,
    author: {
      name: userName(author),
      profileUrl: absoluteUrl(author.profileUrl),
      credential: answer.authorCredential || author.bestCredential || null
    },
    question: {
      qid: String(question.qid ?? question.id ?? ""),
      url: absoluteUrl(question.url),
      answerCount: question.answerCount ?? question.decanonicalizedAnswerCount ?? null
    },
    metrics: {
      upvotes: answer.numUpvotes ?? null,
      comments: answer.numDisplayComments ?? null,
      shares: answer.numShares ?? null,
      views: answer.numViews ?? null
    }
  };
}

function normalizeQuestionStory(story) {
  const question = story.question || {};
  const asker = question.asker || {};
  return {
    type: "question",
    id: String(question.qid ?? question.id ?? ""),
    url: absoluteUrl(question.url),
    title: qtextText(question.title),
    author: {
      name: userName(asker),
      profileUrl: absoluteUrl(asker.profileUrl),
      credential: null
    },
    metrics: {
      answers: question.decanonicalizedAnswerCount ?? question.answerCount ?? null,
      followers: question.followerCount ?? null
    }
  };
}

async function fetchGraphQLFeed(page, section, tid, limit) {
  const items = [];
  let seen = new Set();
  let after = null;
  let loadedBundles = 0;
  let pageNumber = 0;

  const initialQuery = section === "read" ? "TopicReadMultifeedLoggedIn_Query" : "TopicWriteMultifeed_Query";
  const initialHash = section === "read" ? READ_INITIAL_HASH : WRITE_INITIAL_HASH;
  const multifeedPage = section === "read" ? "topic" : "top_questions_in_topic";

  while (items.length < limit && pageNumber < PAGE_CAP) {
    let body;
    if (pageNumber === 0) {
      body = await callGraphQL(page, initialQuery, {
        multifeedAfter: null,
        multifeedNumBundlesOnClient: 0,
        tid,
        first: PAGE_SIZE
      }, initialHash);
    } else {
      body = await callGraphQL(page, "MultifeedQuery", {
        first: PAGE_SIZE,
        multifeedAfter: after,
        multifeedNumBundlesOnClient: loadedBundles,
        injectionType: null,
        injectionData: null,
        filterStoryType: null,
        filterStoryOid: null,
        multifeedPage,
        pageData: tid,
        showLiveBanner: false
      }, MULTIFEED_HASH);
    }

    const connection = body.data?.multifeedObject?.multifeedConnection;
    if (!connection || !Array.isArray(connection.edges)) {
      throw new Error("GraphQL multifeedConnection schema missing");
    }

    for (const edge of connection.edges) {
      const bundle = edge?.node;
      if (!bundle) continue;
      const bundleType = bundle.__typename;
      if (bundleType === "AdBundle") continue;

      let stories = [];
      if (Array.isArray(bundle.stories)) {
        stories = bundle.stories;
      } else if (bundle.bundleConnection?.edges) {
        stories = bundle.bundleConnection.edges.map(e => e?.node).filter(Boolean);
      }

      for (const story of stories) {
        if (!story) continue;
        const storyType = story.__typename;
        let item;
        if (storyType === "AnswerFeedStory" && story.answer) {
          item = normalizeAnswerStory(story);
        } else if (storyType === "QuestionFeedStory" && story.question) {
          item = normalizeQuestionStory(story);
        } else {
          continue;
        }

        const key = `${item.type}:${item.id}`;
        if (!key.endsWith(":") && seen.has(key)) continue;
        seen.add(key);
        items.push(item);
        if (items.length >= limit) break;
      }
      if (items.length >= limit) break;
    }

    loadedBundles += connection.edges.length;
    const next = connection.pageInfo?.endCursor;
    if (!connection.pageInfo?.hasNextPage || next === null || next === undefined || String(next) === String(after)) {
      break;
    }
    after = next;
    pageNumber += 1;
    await sleep(randomBetween(260, 520));
  }

  const partial = items.length < limit;
  return { items, partial, source: "api" };
}

async function fetchWritersDOM(page, slug, limit) {
  const url = topicUrl(slug, "writers");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(randomBetween(450, 800));
  await lightHumanize(page, true);

  // The writers list is server-rendered as plain text with a regular pattern:
  //   <views> views <name> [, credential] <answers> answers Follow
  // We pull the text and the set of profile links, then match names to real
  // profile URLs instead of guessing slugs.
  const raw = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const links = [...document.querySelectorAll('a[href*="/profile/"]')]
      .map(a => ({ name: a.innerText?.trim(), href: a.getAttribute("href") || "" }))
      .filter(l => l.name && !l.href.includes("#"));
    return { bodyText, links };
  });

  const writers = [];
  const seenHrefs = new Set();
  const writerPattern = /([\d,]+\s*[KMB]?)\s*views\s*\n?([\s\S]*?)\n\s*([\d.]+\s*[KMB]?)\s+answers/gi;

  let match;
  while ((match = writerPattern.exec(raw.bodyText)) !== null && writers.length < limit) {
    const viewsText = match[1];
    const nameCredential = match[2].trim();
    const answersText = match[3];

    // Split on the first comma (if any) to separate name and credential.
    let name = nameCredential.replace(/\n+/g, " ").trim();
    let credential = null;
    const commaIdx = nameCredential.indexOf(",");
    if (commaIdx !== -1) {
      name = nameCredential.slice(0, commaIdx).replace(/\n+/g, " ").trim();
      credential = nameCredential.slice(commaIdx + 1).replace(/\n+/g, " ").trim();
      if (!credential) credential = null;
    }

    if (!name) continue;

    // Match the parsed name to an actual profile link on the page.
    const link = raw.links.find(l => l.name === name);
    if (!link) continue;
    if (seenHrefs.has(link.href)) continue;
    seenHrefs.add(link.href);

    writers.push({
      type: "writer",
      rank: writers.length + 1,
      name,
      profileUrl: absoluteUrl(link.href),
      credential,
      answerViews: parseNumber(viewsText),
      answerCount: parseNumber(answersText)
    });
  }

  const partial = writers.length < limit;
  return { items: writers.slice(0, limit), partial, source: "dom" };
}

async function fallbackFeedDOM(page, section, limit) {
  // Simple DOM fallback: scroll the current page and extract visible cards
  const records = [];
  const seen = new Set();

  for (let pass = 0; pass < 8 && records.length < limit; pass += 1) {
    const batch = await page.evaluate(({ requestedSection, max }) => {
      const absolute = value => {
        try { return value ? new URL(value, location.origin).toString() : null; } catch { return null; }
      };
      const items = [];
      const seenKeys = new Set();
      const add = item => {
        const key = `${item.type}:${item.id}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        items.push(item);
      };

      if (requestedSection === "top_questions") {
        for (const card of document.querySelectorAll(".puppeteer_test_question_component_base")) {
          const titleEl = card.querySelector("a[href]");
          const title = titleEl?.innerText?.trim();
          const href = titleEl?.getAttribute("href");
          if (!title || !href) continue;
          const text = card.innerText || "";
          const answersMatch = text.match(/([\d,]+\s*[KMB]?)\s+answers/i);
          const followersMatch = text.match(/([\d,]+\s*[KMB]?)\s+followers/i);
          add({
            type: "question",
            id: href,
            url: absolute(href),
            title,
            author: { name: null, profileUrl: null, credential: null },
            metrics: {
              answers: answersMatch ? answersMatch[1] : null,
              followers: followersMatch ? followersMatch[1] : null
            }
          });
          if (items.length >= max) break;
        }
      } else {
        // read section: mixed answer/question cards
        for (const titleEl of document.querySelectorAll(".puppeteer_test_question_title")) {
          const title = titleEl.innerText?.trim();
          if (!title) continue;
          // Walk up to find card container
          let card = titleEl;
          for (let i = 0; card && i < 14; i += 1, card = card.parentElement) {
            if (card.querySelector(".puppeteer_test_votable_upvote_button")) break;
          }
          const links = [...(card || titleEl).querySelectorAll("a[href]")];
          const answerLink = links.find(a => /\/answer\//.test(a.getAttribute("href") || ""));
          const questionLink = links.find(a => !/\/answer\//.test(a.getAttribute("href") || ""));
          const content = (card || titleEl).querySelector(".puppeteer_test_answer_content")?.innerText?.trim() || null;
          const upvoteText = (card || titleEl).querySelector(".puppeteer_test_votable_upvote_button")?.innerText?.trim() || null;
          const authorEl = links.find(a => /\/profile\//.test(a.getAttribute("href") || ""));

          if (answerLink) {
            add({
              type: "answer",
              id: answerLink.getAttribute("href"),
              url: absolute(answerLink.getAttribute("href")),
              title,
              excerpt: content,
              publishedAt: null,
              author: {
                name: authorEl?.innerText?.trim() || null,
                profileUrl: absolute(authorEl?.getAttribute("href")),
                credential: null
              },
              question: {
                qid: questionLink?.getAttribute("href") || null,
                url: absolute(questionLink?.getAttribute("href")),
                answerCount: null
              },
              metrics: {
                upvotes: upvoteText,
                comments: null,
                shares: null,
                views: null
              }
            });
          } else if (questionLink) {
            add({
              type: "question",
              id: questionLink.getAttribute("href"),
              url: absolute(questionLink.getAttribute("href")),
              title,
              author: { name: null, profileUrl: null, credential: null },
              metrics: { answers: null, followers: null }
            });
          }
          if (items.length >= max) break;
        }
      }

      return items;
    }, { requestedSection: section, max: limit - records.length });

    for (const item of batch) {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(item);
      if (records.length >= limit) break;
    }

    if (records.length >= limit) break;
    const before = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollBy(0, Math.max(400, Math.floor(window.innerHeight * 0.85))));
    await new Promise(resolve => setTimeout(resolve, 360 + Math.floor(Math.random() * 360)));
    const after = await page.evaluate(() => document.body.scrollHeight);
    const atEnd = await page.evaluate(() => window.scrollY + window.innerHeight >= document.body.scrollHeight - 8);
    if (atEnd && before === after) break;
  }

  return { items: records.slice(0, limit), partial: true, source: "dom" };
}

export default async (page, params, cwd) => {
  const topic = typeof params.topic === "string" ? params.topic.trim() : "";
  if (!topic) fail("MISSING_PARAM", "topic is required");
  if (topic.includes("/") || topic.includes("?")) fail("INVALID_PARAM", "topic should be the slug only, not a full URL");

  const section = params.section;
  if (!SECTIONS.has(section)) fail("INVALID_PARAM", `section must be one of ${[...SECTIONS].join(", ")}`);

  const rawLimit = params.limit === undefined || params.limit === null ? "" : String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit) < 1) {
    fail("INVALID_PARAM", "limit must be a positive integer");
  }
  const limit = Number(rawLimit);
  if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);

  const url = topicUrl(topic, section);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(randomBetween(450, 800));
    await lightHumanize(page);

    if (await isNotFound(page)) {
      fail("NOT_FOUND", `Topic "${topic}" not found`);
    }

    const metadata = await readTopicMetadata(page);
    if (!metadata.name) {
      fail("NOT_FOUND", `Topic "${topic}" not found (no topic header)`);
    }

    const tid = await readTid(page);
    if (!tid) {
      // Could be a login wall or structural drift; try DOM fallback for writers only
      if (section === "writers") {
        const domResult = await fetchWritersDOM(page, topic, limit);
        return {
          topic: {
            name: metadata.name,
            slug: topic,
            url: absoluteUrl(`/topic/${topic}`),
            tid: null,
            followerCount: parseNumber(metadata.followerCount)
          },
          section,
          limit,
          items: domResult.items,
          count: domResult.items.length,
          partial: domResult.partial,
          source: domResult.source
        };
      }
      fail("DRIFT_DETECTED", "Unable to resolve topic tid; page structure may have changed");
    }

    let result;
    if (section === "writers") {
      result = await fetchWritersDOM(page, topic, limit);
    } else {
      try {
        result = await fetchGraphQLFeed(page, section, tid, limit);
      } catch (apiError) {
        // GraphQL failed; fall back to DOM extraction by staying on the current page and scrolling
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await sleep(randomBetween(420, 820));
        await lightHumanize(page, true);
        result = await fallbackFeedDOM(page, section, limit);
      }
    }

    return {
      topic: {
        name: metadata.name,
        slug: topic,
        url: absoluteUrl(`/topic/${topic}`),
        tid,
        followerCount: parseNumber(metadata.followerCount)
      },
      section,
      limit,
      items: result.items,
      count: result.items.length,
      partial: result.partial,
      source: result.source
    };
  } catch (error) {
    if (error?.code) throw error;
    fail("DRIFT_DETECTED", error.message || "Unknown page error");
  }
};
