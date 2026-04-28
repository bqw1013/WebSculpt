export default async function (params) {
  const type = params.type;
  const limit = parseInt(params.limit, 10);

  const validTypes = ["top", "best", "new"];
  if (!validTypes.includes(type)) {
    const error = new Error(
      `[MISSING_PARAM] Parameter "type" must be one of: ${validTypes.join(", ")}`
    );
    error.code = "MISSING_PARAM";
    throw error;
  }

  if (isNaN(limit) || limit < 1 || limit > 30) {
    const error = new Error(
      `[MISSING_PARAM] Parameter "limit" must be an integer between 1 and 30`
    );
    error.code = "MISSING_PARAM";
    throw error;
  }

  const listUrl = `https://hacker-news.firebaseio.com/v0/${type}stories.json`;

  let storyIds;
  try {
    const listRes = await fetch(listUrl);
    if (!listRes.ok) {
      throw new Error(`HN list API returned ${listRes.status}`);
    }
    storyIds = await listRes.json();
  } catch (err) {
    const error = new Error(`[COMMAND_EXECUTION_ERROR] Failed to fetch story list: ${err.message}`);
    error.code = "COMMAND_EXECUTION_ERROR";
    throw error;
  }

  if (!Array.isArray(storyIds) || storyIds.length === 0) {
    const error = new Error("[EMPTY_RESULT] No stories returned from HN");
    error.code = "EMPTY_RESULT";
    throw error;
  }

  const targetIds = storyIds.slice(0, limit);

  const stories = await Promise.all(
    targetIds.map(async (id) => {
      try {
        const itemRes = await fetch(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`
        );
        if (!itemRes.ok) {
          return null;
        }
        const item = await itemRes.json();
        if (!item || item.type !== "story") {
          return null;
        }
        return {
          id: item.id,
          title: item.title || "",
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          by: item.by || "",
          descendants: item.descendants || 0,
          time: item.time || 0,
        };
      } catch {
        return null;
      }
    })
  );

  const validStories = stories.filter((s) => s !== null);

  if (validStories.length === 0) {
    const error = new Error("[EMPTY_RESULT] No valid stories found");
    error.code = "EMPTY_RESULT";
    throw error;
  }

  return {
    type,
    limit,
    count: validStories.length,
    stories: validStories,
  };
}
