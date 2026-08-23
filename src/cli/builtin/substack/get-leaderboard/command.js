export default async (page, params, cwd) => {
  const categoryInput = params.category.toLowerCase();
  const limit = parseInt(params.limit, 10);

  if (isNaN(limit) || limit < 1 || limit > 200) {
    const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 200");
    err.code = "INVALID_PARAM";
    throw err;
  }

  let apiCategory = categoryInput;
  if (categoryInput === "new-bestsellers") {
    apiCategory = "bestseller";
  }

  let ranking = "paid";
  if (apiCategory === "bestseller") {
    ranking = "trending";
  }

  // Establish a substack origin so relative fetch URLs resolve correctly.
  await page.goto("https://substack.com", { waitUntil: "domcontentloaded" });

  let categoryId = apiCategory;

  if (apiCategory !== "bestseller" && apiCategory !== "for-you") {
    const categories = await page.evaluate(async () => {
      const res = await fetch("/api/v1/categories?purpose=leaderboard");
      if (!res.ok) {
        throw new Error(`categories API failed: ${res.status}`);
      }
      return res.json();
    });

    const matched = categories.find(c => c.slug === apiCategory);
    if (!matched) {
      const validSlugs = categories.map(c => c.slug).join(", ");
      const err = new Error(`[INVALID_PARAM] Unknown category '${params.category}'. Valid categories: ${validSlugs}`);
      err.code = "INVALID_PARAM";
      throw err;
    }
    categoryId = matched.id;
  }

  const rawItems = await page.evaluate(async ({ categoryId, ranking, limit, isForYou }) => {
    const results = [];
    let pageNum = 0;
    const maxPages = 20;

    while (results.length < limit && pageNum < maxPages) {
      const res = await fetch(`/api/v1/category/leaderboard/${categoryId}/${ranking}?page=${pageNum}`);
      if (!res.ok) {
        throw new Error(`leaderboard API failed: ${res.status}`);
      }
      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        break;
      }
      results.push(...data.items);
      if (isForYou) {
        break;
      }
      pageNum++;
    }

    return results.slice(0, limit);
  }, { categoryId, ranking, limit, isForYou: apiCategory === "for-you" });

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    const err = new Error("[EMPTY_RESULT] No leaderboard items returned");
    err.code = "EMPTY_RESULT";
    throw err;
  }

  const items = rawItems.map((item, index) => {
    const pub = item.publication || {};
    const user = item.user || {};
    const baseUrl = pub.base_url || (pub.subdomain ? `https://${pub.subdomain}.substack.com` : null);

    let subscriberCount = null;
    if (pub.freeSubscriberCount) {
      const parsed = parseInt(String(pub.freeSubscriberCount).replace(/,/g, ""), 10);
      if (!isNaN(parsed)) {
        subscriberCount = parsed;
      }
    }

    return {
      rank: index + 1,
      author: user.name || null,
      handle: user.handle || null,
      author_url: user.handle ? `https://substack.com/@${user.handle}` : null,
      publication: pub.name || null,
      publication_url: baseUrl,
      avatar_url: user.photo_url || null,
      subscriber_count: subscriberCount,
      subscriber_count_text: pub.rankingDetail || null,
    };
  });

  return items;
};
