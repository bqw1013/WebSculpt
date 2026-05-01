async function (page) {
  /* PARAMS_INJECT */
  const language = params.language || "";
  const since = params.since;
  const limit = parseInt(params.limit, 10);

  page = await page.context().newPage();
  try {
    const validSince = ["daily", "weekly", "monthly"];
    if (!validSince.includes(since)) {
      throw new Error("[MISSING_PARAM] Parameter 'since' must be one of: daily, weekly, monthly");
    }

    const baseUrl = language
      ? `https://github.com/trending/${encodeURIComponent(language)}?since=${since}`
      : `https://github.com/trending?since=${since}`;

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("article.Box-row", { timeout: 15000 });

    const repos = await page.evaluate(() => {
      const articles = document.querySelectorAll("article.Box-row");
      return Array.from(articles).map((art) => {
        const link = art.querySelector("h2 a");
        const name = link
          ? link.textContent.trim().replace(/\s+/g, " ")
          : "";
        const description =
          art.querySelector("p.col-9")?.textContent.trim() || "";
        const lang =
          art.querySelector('[itemprop="programmingLanguage"]')
            ?.textContent.trim() || "";
        const starsToday =
          art.querySelector("span.d-inline-block.float-sm-right")
            ?.textContent.trim() || "";
        return { name, description, language: lang, starsToday };
      });
    });

    if (repos.length === 0) {
      throw new Error("[EMPTY_RESULT] No trending repositories found on the page");
    }

    const driftCheck = repos.every((r) => !r.name);
    if (driftCheck) {
      throw new Error("[DRIFT_DETECTED] Page structure may have changed, unable to extract repository names");
    }

    return { items: repos.slice(0, limit) };
  } finally {
    await page.close();
  }
}
