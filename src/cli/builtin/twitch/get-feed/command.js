// Helper functions can be defined above export default

const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const HASH_POPULAR = "97fed6737c9ef90e8552fb7d02bf4e5d20da0af3cad2a5492d9c93f94e95c29e";
const HASH_GAME = "86bcceb4e8b1a51256ff8eed8bd8aae4acacf80d737efe904f84f3aeadf8cafd";
const MAX_PAGE = 30; // Twitch GraphQL hard-caps `limit` at 30 per call

// 34 language codes verified from the /directory/all language filter dialog
// (Chinese UI display name shown as 对照; code = Twitch broadcasterLanguages value).
const LANG_CODES = {
  zh: "中文", en: "English", id: "Bahasa Indonesia", ca: "Català", da: "Dansk",
  de: "Deutsch", es: "Español", fr: "Français", it: "Italiano", hu: "Magyar",
  nl: "Nederlands", no: "Norsk", pl: "Polski", pt: "Português", ro: "Română",
  sk: "Slovenčina", fi: "Suomi", sv: "Svenska", tl: "Tagalog", vi: "Tiếng Việt",
  tr: "Türkçe", cs: "Čeština", el: "Ελληνικά", bg: "Български", ru: "Русский",
  uk: "Українська", ar: "العربية", ms: "بهاس ملايو", hi: "मानक हिन्दी", th: "ภาษาไทย",
  ja: "日本語", ko: "한국어", asl: "American Sign Language", other: "其他",
};

// 4 sort options verified from the page's sort dropdown (Chinese UI name → GraphQL sort).
// NOTE: the server silently IGNORES "VIEWER_COUNT" (verified against the real browser
// request: same body+integrity header, response is still RELEVANCE-ordered), so the
// "viewers" descending order is applied CLIENT-SIDE over the fetched page. The page UI
// offers this option but the underlying query never sorts descending; semantics for
// "viewers" = "top N by viewers within the anonymous ~30-item page".
const SORT_VALUE = {
  recommended: "RELEVANCE",   // 为您推荐 (server sorts)
  viewers: "VIEWER_COUNT",    // 观众人数（高到低）→ client-side sort descending
  "viewers-asc": "VIEWER_COUNT_ASC", // 观众人数（低到高）→ client-side sort ascending (server also honors, kept for safety)
  recent: "RECENT",           // 最近开始 (server sorts)
};

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (parseInt(c) ^ (Math.random() * 16 >> parseInt(c) / 4)).toString(16)
  );
}

export default async (page, params, cwd) => {
  const categoryRaw = params.category === undefined || params.category === null
    ? ""
    : String(params.category).trim();

  const sort = params.sort === undefined || params.sort === null || params.sort === ""
    ? "recommended"
    : String(params.sort).trim().toLowerCase();
  const sortValue = SORT_VALUE[sort];
  if (!sortValue) {
    throw makeError("INVALID_PARAM", `sort must be one of: ${Object.keys(SORT_VALUE).join(", ")}`);
  }

  const language = params.language === undefined || params.language === null
    ? ""
    : String(params.language).trim().toLowerCase();
  if (language && !LANG_CODES[language]) {
    throw makeError("INVALID_PARAM", `language must be one of: ${Object.keys(LANG_CODES).join(", ")}`);
  }

  const rawLimit = params.limit === undefined || params.limit === null || params.limit === ""
    ? "20"
    : String(params.limit).trim();
  if (!/^\d+$/.test(rawLimit)) {
    throw makeError("INVALID_LIMIT", "limit must be a positive integer");
  }
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw makeError("INVALID_LIMIT", "limit must be between 1 and 100");
  }

  const pageLimit = Math.min(MAX_PAGE, limit);
  const broadcasterLanguages = language ? [language.toUpperCase()] : [];
  const recommendationsContext = { platform: "web" };
  const baseOptions = {
    includeRestricted: ["SUB_ONLY_LIVE"],
    sort: sortValue,
    freeformTags: null,
    tags: [],
    recommendationsContext,
    requestID: uuidv4(),
    broadcasterLanguages,
  };

  const operation = categoryRaw
    ? {
        operationName: "DirectoryPage_Game",
        variables: {
          imageWidth: 50,
          slug: categoryRaw,
          options: Object.assign({}, baseOptions, { systemFilters: [] }),
          sortTypeIsRecency: sort === "recent",
          limit: pageLimit,
          includeCostreaming: true,
        },
        extensions: { persistedQuery: { version: 1, sha256Hash: HASH_GAME } },
      }
    : {
        operationName: "BrowsePage_Popular",
        variables: {
          imageWidth: 50,
          limit: pageLimit,
          platformType: "all",
          options: baseOptions,
          sortTypeIsRecency: sort === "recent",
          includeCostreaming: true,
        },
        extensions: { persistedQuery: { version: 1, sha256Hash: HASH_POPULAR } },
      };

  let gqlResult = null;
  let lastError = null;
  const maxRetries = 4;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      gqlResult = await page.evaluate(async ({ body, clientId }) => {
        const res = await fetch("https://gql.twitch.tv/gql", {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=UTF-8",
            "Client-Id": clientId,
          },
          body: JSON.stringify([body]),
        });
        return { status: res.status, text: await res.text() };
      }, { body: operation, clientId: CLIENT_ID });
    } catch (error) {
      gqlResult = null;
      lastError = `Twitch GraphQL request failed: ${error && error.message ? error.message : error}`;
    }

    if (gqlResult && gqlResult.status === 200) {
      let parsed;
      try {
        parsed = JSON.parse(gqlResult.text);
      } catch (e) {
        lastError = `Failed to parse GraphQL response: ${e.message}`;
        parsed = null;
      }
      if (parsed && Array.isArray(parsed) && parsed[0] && parsed[0].errors && parsed[0].errors.length > 0) {
        lastError = parsed[0].errors[0].message;
        if (!/service error/i.test(lastError)) {
          break; // non-retryable GraphQL error (e.g. integrity challenge)
        }
      } else {
        break; // success
      }
    } else if (gqlResult) {
      lastError = `GraphQL returned HTTP ${gqlResult.status}`;
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }

  if (!gqlResult || gqlResult.status !== 200) {
    throw makeError("DRIFT_DETECTED", lastError || `GraphQL request failed after ${maxRetries} attempts`);
  }

  let data;
  try {
    data = JSON.parse(gqlResult.text);
  } catch (e) {
    throw makeError("DRIFT_DETECTED", `Failed to parse GraphQL response: ${e.message}`);
  }
  if (!Array.isArray(data) || data.length === 0 || !data[0].data) {
    throw makeError("DRIFT_DETECTED", lastError || "Unexpected GraphQL response structure");
  }
  const entry = data[0];
  if (entry.errors && entry.errors.length > 0) {
    throw makeError("DRIFT_DETECTED", entry.errors[0].message);
  }
  const root = entry.data;
  const streams = root.streams || (root.game && root.game.streams);
  if (!streams || !Array.isArray(streams.edges)) {
    throw makeError("EMPTY_RESULT", "No live channels found for the current query");
  }

  // The server ignores "VIEWER_COUNT", so apply viewers descending / ascending
  // ordering client-side over the fetched page (see SORT_VALUE note above).
  const nodes = [];
  for (const edge of streams.edges) {
    if (edge && edge.node) nodes.push(edge.node);
  }
  if (sort === "viewers") {
    nodes.sort((a, b) => (b.viewersCount || 0) - (a.viewersCount || 0));
  } else if (sort === "viewers-asc") {
    nodes.sort((a, b) => (a.viewersCount || 0) - (b.viewersCount || 0));
  }

  const items = [];
  for (let i = 0; i < Math.min(nodes.length, limit); i++) {
    const node = nodes[i];
    const broadcaster = node.broadcaster || null;
    const game = node.game || null;
    const channel = broadcaster ? broadcaster.login : null;
    items.push({
      channel,
      title: node.title || null,
      category: game ? (game.displayName || game.name || null) : null,
      categorySlug: game ? (game.slug || null) : null,
      viewers: typeof node.viewersCount === "number" ? node.viewersCount : null,
      thumbnailUrl: node.previewImageURL || null,
      url: channel ? `https://www.twitch.tv/${channel}` : null,
    });
  }

  return {
    category: categoryRaw || null,
    language: language || null,
    sort,
    limit,
    items,
    count: items.length,
    partial: nodes.length < limit,
  };
};
