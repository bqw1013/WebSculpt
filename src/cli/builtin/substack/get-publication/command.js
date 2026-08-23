export default async (page, params, cwd) => {
  const publication = (params.publication || '').trim();
  if (!publication) {
    const err = new Error('[MISSING_PARAM] publication is required');
    err.code = 'MISSING_PARAM';
    throw err;
  }
  if (!/^[a-zA-Z0-9-]+$/.test(publication)) {
    const err = new Error('[INVALID_PARAM] publication must be a valid subdomain (alphanumeric and hyphens only)');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const tab = (params.tab || 'latest').trim().toLowerCase();
  if (tab !== 'latest' && tab !== 'top') {
    const err = new Error('[INVALID_PARAM] tab must be "latest" or "top"');
    err.code = 'INVALID_PARAM';
    throw err;
  }

  const sort = tab === 'latest' ? 'new' : 'top';
  const baseUrl = `https://${publication}.substack.com/`;
  const targetUrl = `${baseUrl}?sort=${sort}`;

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (navErr) {
    const msg = navErr.message || '';
    if (msg.includes('ERR_NAME_NOT_RESOLVED') || msg.includes('net::ERR')) {
      const err = new Error(`[NOT_FOUND] Publication not found: ${publication}`);
      err.code = 'NOT_FOUND';
      throw err;
    }
    throw navErr;
  }

  // Wait for a stable post element to confirm the page rendered, but do not fail
  // immediately because a 404 page will not have it.
  try {
    await page.waitForSelector('[data-testid="post-preview-title"]', { timeout: 5000 });
  } catch (_) {
    // continue to API check; 404 pages will return 404 below
  }

  const result = await page.evaluate(async (tab) => {
    const field = tab === 'latest' ? 'newPosts' : 'topPosts';
    let apiRes;
    try {
      apiRes = await fetch('/api/v1/homepage_data', { credentials: 'include' });
    } catch (e) {
      return { apiError: e.message };
    }

    if (apiRes.status === 404) {
      return { notFound: true, status: 404 };
    }

    let data;
    try {
      data = await apiRes.json();
    } catch (e) {
      return { apiError: `Failed to parse API response: ${e.message}`, status: apiRes.status };
    }

    const posts = data[field];
    if (!Array.isArray(posts)) {
      return { drift: true, field, availableFields: Object.keys(data) };
    }

    // Publication metadata
    let name = null;
    let description = null;
    let author = null;

    const ldScript = document.querySelector('script[type="application/ld+json"]');
    if (ldScript) {
      try {
        const ld = JSON.parse(ldScript.textContent);
        if (ld && ld.name) name = ld.name;
      } catch (_) {}
    }

    const descMeta = document.querySelector('meta[property="og:description"], meta[name="description"]');
    if (descMeta) description = descMeta.getAttribute('content') || null;

    const titleParts = (document.title || '').split('|').map(s => s.trim());
    if (titleParts.length >= 3 && titleParts[titleParts.length - 1] === 'Substack') {
      author = titleParts[titleParts.length - 2] || null;
    }
    if (!author && description) {
      const m = description.match(/by\s+([^,]+),\s*a\s+Substack/i);
      if (m) author = m[1].trim();
    }

    return {
      status: apiRes.status,
      name,
      description,
      author,
      posts
    };
  }, tab);

  if (result.notFound) {
    const err = new Error(`[NOT_FOUND] Publication not found: ${publication}`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (result.apiError) {
    const err = new Error(`[API_ERROR] ${result.apiError}`);
    err.code = 'API_ERROR';
    throw err;
  }

  if (result.drift) {
    const err = new Error(`[DRIFT_DETECTED] Expected field "${result.field}" missing from API response. Available fields: ${(result.availableFields || []).join(', ')}`);
    err.code = 'DRIFT_DETECTED';
    throw err;
  }

  const posts = result.posts.map((p) => ({
    id: p.id,
    title: (p.title || '').trim(),
    subtitle: (p.subtitle || '').trim(),
    url: p.canonical_url || `${baseUrl}p/${p.slug}`,
    published_at: p.post_date,
    slug: p.slug
  }));

  return {
    publication: {
      name: result.name || publication,
      description: result.description,
      url: baseUrl,
      author: result.author
    },
    tab,
    posts
  };
};
