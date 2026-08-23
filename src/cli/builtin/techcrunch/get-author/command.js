// techcrunch/get-author
// Parse a TechCrunch author's server-rendered archive page (https://techcrunch.com/author/{slug}/)
// into a profile object plus article cards, following classic pagination (/page/N/) until the
// limit is reached or the archive is exhausted.
// The WP REST users endpoint is disabled and posts?author= returns empty, so this command parses HTML.

function decodeHtml(s) {
  return (s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8230;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuery(url) {
  if (!url) return "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAuthorHero(html, slug) {
  const titleMatch = html.match(/<h1 class="wp-block-techcrunch-author-archive-hero__title">([\s\S]*?)<\/h1>/);
  const metaMatch = html.match(/<p class="wp-block-techcrunch-author-archive-hero__meta">([\s\S]*?)<\/p>/);
  const bioMatch = html.match(/<div class="wp-block-techcrunch-author-archive-hero__bio">([\s\S]*?)<\/div>/);
  const avatarMatch = html.match(/<figure class="tc23-author-archive-hero__media">\s*<img[^>]*src="([^"]*)"/);
  if (!titleMatch) return null;
  return {
    name: decodeHtml(titleMatch[1]),
    slug,
    profileUrl: `https://techcrunch.com/author/${slug}/`,
    avatar: avatarMatch ? stripQuery(avatarMatch[1]) : "",
    bio: bioMatch ? decodeHtml(bioMatch[1]) : "",
  };
}

function parseCards(html) {
  const articles = [];
  // Each card is <li class="wp-block-post ...">; splitting on the marker yields one chunk per card.
  const parts = html.split('<li class="wp-block-post').slice(1);
  for (const part of parts) {
    const classEnd = part.indexOf('"');
    const liClass = classEnd >= 0 ? part.slice(0, classEnd) : "";
    const categories = [...liClass.matchAll(/category-([a-z0-9-]+)/g)]
      .map((m) => m[1])
      .filter((c) => c !== "tc" && c !== "ben-test-2");
    const titleMatch = part.match(/href="([^"]+)"[^>]*class="loop-card__title-link"[^>]*>([\s\S]*?)<\/a>/);
    const timeMatch = part.match(/<time datetime="([^"]*)"[^>]*class="[^"]*loop-card__time/);
    const imageMatch = part.match(/<figure class="loop-card__figure">\s*<img[^>]*src="([^"]*)"/);
    if (!titleMatch) continue;
    articles.push({
      title: decodeHtml(titleMatch[2]),
      url: titleMatch[1],
      date: timeMatch ? timeMatch[1] : "",
      // The archive page cards do not render an excerpt (only category, title, author, time),
      // so this field is always empty. Retained for schema stability with sibling commands.
      excerpt: "",
      image: imageMatch ? stripQuery(imageMatch[1]) : "",
      categories,
    });
  }
  const nextMatch = html.match(/href="([^"]+)"[^>]*class="wp-block-query-pagination-next"/);
  return { articles, nextPage: nextMatch ? nextMatch[1] : null };
}

export default async function (params) {
  const author = (params.author || "").trim();
  if (!author) {
    const err = new Error(
      "[MISSING_PARAM] author is required. Pass the author slug, e.g. --author lucas-ropek"
    );
    err.code = "MISSING_PARAM";
    throw err;
  }
  // Author slugs can contain uppercase letters (e.g. "margaux-macColl"), so be lenient:
  // allow letters, digits, hyphens, underscores, dots — reject anything that would break the URL.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(author)) {
    const err = new Error(
      `[INVALID_PARAM] Invalid author slug "${author}". The author slug is the last segment of the author page URL (techcrunch.com/author/{slug}/), e.g. "lucas-ropek". Lowercase, hyphenated. Discover it from any article byline or the author.slug field of techcrunch/get-article.`
    );
    err.code = "INVALID_PARAM";
    throw err;
  }

  const limit = parseInt(params.limit, 10);
  if (isNaN(limit) || limit < 1 || limit > 100) {
    const err = new Error("[INVALID_PARAM] limit must be a number between 1 and 100");
    err.code = "INVALID_PARAM";
    throw err;
  }

  const profileUrl = `https://techcrunch.com/author/${author}/`;
  const articles = [];
  let authorInfo = null;
  let nextPage = profileUrl;
  let sawAnyPage = false;

  while (nextPage && articles.length < limit) {
    // Random 200-700ms pause before each request to keep cadence moderate.
    await sleep(200 + Math.random() * 500);

    let response;
    try {
      response = await fetch(nextPage);
    } catch (err) {
      const error = new Error(`[NETWORK_ERROR] Failed to fetch ${nextPage}: ${err.message}`);
      error.code = "NETWORK_ERROR";
      throw error;
    }

    if (response.status === 404) {
      if (!sawAnyPage) {
        const error = new Error(`[NOT_FOUND] No TechCrunch author "${author}" found at ${profileUrl}`);
        error.code = "NOT_FOUND";
        throw error;
      }
      break; // pagination ran past the last page
    }
    if (!response.ok) {
      const error = new Error(
        `[HTTP_ERROR] TechCrunch author page returned ${response.status} ${response.statusText}`
      );
      error.code = "HTTP_ERROR";
      throw error;
    }

    let html;
    try {
      html = await response.text();
    } catch (err) {
      const error = new Error(`[NETWORK_ERROR] Failed to read response body: ${err.message}`);
      error.code = "NETWORK_ERROR";
      throw error;
    }
    sawAnyPage = true;

    if (!authorInfo) {
      authorInfo = parseAuthorHero(html, author);
      if (!authorInfo) {
        const error = new Error(
          "[DRIFT_DETECTED] Author hero block not found on the archive page; the TechCrunch author page structure may have changed"
        );
        error.code = "DRIFT_DETECTED";
        throw error;
      }
    }

    const parsed = parseCards(html);
    if (parsed.articles.length === 0) break; // valid author with no articles, or archive end

    for (const article of parsed.articles) {
      if (articles.length >= limit) break;
      articles.push(article);
    }
    nextPage = parsed.nextPage;
  }

  return {
    author: authorInfo || { name: author, slug: author, profileUrl },
    articles,
    partial: articles.length < limit,
  };
}
