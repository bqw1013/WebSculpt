export default async (page, params) => {
  const limit = parseInt(params.limit, 10);

  await page.goto("https://www.zhihu.com/hot", { waitUntil: "networkidle" });
  await page.waitForSelector("section a[href*='question']", { timeout: 15000 });

  const data = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll("section a[href*='question'], section a[href*='zhuanlan']")
    );

    const seen = new Set();
    const results = [];

    for (const a of links) {
      const title = a.textContent.trim();
      if (title.length <= 5) continue;

      if (seen.has(a.href)) continue;
      seen.add(a.href);

      const item = a.closest("div[class*='Card'], div[class*='Item'], div[class*='item'], section");
      const heatMatch = item ? item.textContent.match(/(\d+\s*万?\s*热度)/) : null;
      const heat = heatMatch ? heatMatch[1] : "";

      results.push({
        rank: results.length + 1,
        title: title.substring(0, 120),
        heat: heat,
        href: a.href,
      });
    }

    return results;
  });

  if (data.length === 0) {
    throw new Error("[EMPTY_RESULT] No entries could be extracted from Zhihu Hot List");
  }

  return {
    total: Math.min(data.length, limit),
    hotList: data.slice(0, limit),
  };
};
