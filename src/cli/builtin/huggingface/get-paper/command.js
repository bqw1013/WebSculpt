// Hugging Face single-paper detail. Browser runtime.
// Verified in explore: page /papers/{id} is fully SSR; internal API /api/papers/{id}
// provides all structured fields except comments_count, which is counted from the SSR
// DOM (#community section div.scroll-mt-4). Nonexistent id -> HTTP 404 (API) and
// redirect to /papers/index (page) -> NOT_FOUND.

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const humanPause = async (page, min = 250, max = 650) => {
  await page.waitForTimeout(randomInt(min, max));
};

const humanMove = async (page) => {
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const x = Math.max(0, Math.min(size.w, Math.floor(size.w / 2 + (Math.random() - 0.5) * 160)));
  const y = Math.max(0, Math.min(size.h, Math.floor(size.h / 2 + (Math.random() - 0.5) * 160)));
  await page.mouse.move(x, y);
};

const humanScroll = async (page) => {
  const distance = 60 + Math.floor(Math.random() * 100);
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), distance);
};

export default async (page, params, cwd) => {
  const paperId = (params.paper_id || "").trim();

  if (!paperId) {
    const err = new Error("[INVALID_PARAM] paper_id is required (an arXiv id like 2608.05987)");
    err.code = "INVALID_PARAM";
    throw err;
  }
  // HF paper pages use new-style arXiv ids: YYMM.NNNNN / YYMM.NNNN
  if (!/^\d{4}\.\d{4,5}$/.test(paperId)) {
    const err = new Error("[INVALID_PARAM] paper_id must be an arXiv id like 2608.05987");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const url = `https://huggingface.co/papers/${paperId}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

  await humanPause(page);

  // Nonexistent paper: HF redirects to /papers/index?arxivId={id} ("Index missing paper")
  if (page.url().includes("/papers/index")) {
    const err = new Error(`[NOT_FOUND] Paper not found: ${paperId}`);
    err.code = "NOT_FOUND";
    throw err;
  }

  await page.waitForSelector("h1", { timeout: 15000 });
  await humanPause(page);
  await humanMove(page);
  await humanScroll(page);
  await humanPause(page);

  const data = await page.evaluate(async (id) => {
    let resp;
    try {
      resp = await fetch(`/api/papers/${id}`, { headers: { accept: "application/json" } });
    } catch (e) {
      return { notFound: false, error: "fetch_failed" };
    }
    if (resp.status === 404) return { notFound: true };
    if (!resp.ok) return { notFound: false, error: `http_${resp.status}` };
    const j = await resp.json();

    // comments_count is not in the API; count rendered comment cards in the SSR DOM.
    const commHeading = document.querySelector('h3[id="community"]');
    const section = commHeading ? commHeading.parentElement : null;
    const commentsCount = section ? section.querySelectorAll("div.scroll-mt-4").length : 0;

    const submitted = j.submittedOnDailyBy || null;
    return {
      notFound: false,
      id: j.id || id,
      title: j.title || "",
      summary: j.summary || "",
      authors: (j.authors || []).map((a) => (a && a.name ? a.name : null)).filter(Boolean),
      submittedBy: submitted ? (submitted.fullname || submitted.user || submitted.name || null) : null,
      upvotes: typeof j.upvotes === "number" ? j.upvotes : 0,
      publishedAt: j.publishedAt || null,
      commentsCount,
    };
  }, paperId);

  if (data.notFound) {
    const err = new Error(`[NOT_FOUND] Paper not found: ${paperId}`);
    err.code = "NOT_FOUND";
    throw err;
  }
  if (data.error === "fetch_failed") {
    const err = new Error("[NETWORK_ERROR] Failed to fetch paper API from the browser");
    err.code = "NETWORK_ERROR";
    throw err;
  }
  if (data.error) {
    const err = new Error(`[DRIFT_DETECTED] Paper API returned unexpected status ${data.error}`);
    err.code = "DRIFT_DETECTED";
    throw err;
  }
  if (!data.title) {
    const err = new Error("[DRIFT_DETECTED] Paper page structure changed: no title found");
    err.code = "DRIFT_DETECTED";
    throw err;
  }

  // Light pacing before returning.
  await page.waitForTimeout(Math.random() * 1200);

  return {
    id: data.id || paperId,
    title: data.title,
    url,
    abstract: data.summary,
    authors: data.authors,
    submitted_by: data.submittedBy,
    upvotes: data.upvotes,
    comments_count: data.commentsCount,
    published: data.publishedAt,
    arxiv_url: `https://arxiv.org/abs/${paperId}`,
  };
};
