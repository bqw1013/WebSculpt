async function (page) {
  /* PARAMS_INJECT */
  const user = params.user;
  const limit = parseInt(params.limit, 10);

  page = await page.context().newPage();
  try {
    if (!user || user.trim().length === 0) {
      throw new Error('[MISSING_PARAM] Parameter "user" is required. Accepts user ID or full profile URL.');
    }

    let userId = user.trim();
    const urlMatch = userId.match(/zhihu\.com\/people\/([^/?#]+)/);
    if (urlMatch) {
      userId = urlMatch[1];
    }

    const postsUrl = 'https://www.zhihu.com/people/' + encodeURIComponent(userId) + '/posts';

    // Use domcontentloaded instead of networkidle to avoid infinite waiting caused by Zhihu background tracking/heartbeat requests
    await page.goto(postsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for potential client-side redirect
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    if (!currentUrl.includes(userId)) {
      throw new Error('[NOT_FOUND] User "' + userId + '" does not exist or the page was redirected.');
    }

    const pageState = await page.evaluate(() => {
      const title = document.title;
      const notFound = document.querySelector('.ErrorPage, .NotFoundPage') !== null;
      const authWall = document.querySelector('.SignFlowModal, .Modal-wrapper--fill') !== null;
      const hasProfileHeader = document.querySelector('.ProfileHeader') !== null;
      return { title, notFound, authWall, hasProfileHeader };
    });

    if (pageState.authWall) {
      throw new Error('[AUTH_REQUIRED] Zhihu requires login to view this page.');
    }

    if (pageState.notFound || !pageState.hasProfileHeader) {
      throw new Error('[NOT_FOUND] User "' + userId + '" does not exist or profile is unavailable.');
    }

    // Primary selector + fallback selector for page layout changes
    const selectorCandidates = [
      '.Profile-main .ContentItem.ArticleItem',
      '.Profile-main .List-item'
    ];

    let rawPosts = [];
    let selectorFound = false;
    for (const selector of selectorCandidates) {
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
        rawPosts = await page.evaluate((sel) => {
          const items = Array.from(document.querySelectorAll(sel));
          return items.map(item => {
            const titleEl = item.querySelector('.ContentItem-title a');
            return {
              title: titleEl ? titleEl.textContent.trim() : '',
              url: titleEl ? titleEl.href : ''
            };
          }).filter(p => p.title && p.url);
        }, selector);
        if (rawPosts.length > 0) {
          selectorFound = true;
          break;
        }
      } catch (e) {
        // Continue to try the next selector
      }
    }

    if (!selectorFound && rawPosts.length === 0) {
      throw new Error('[DRIFT_DETECTED] Article list selector not found. Page structure may have changed.');
    }

    if (rawPosts.length === 0) {
      throw new Error('[EMPTY_RESULT] No articles found for user "' + userId + '".');
    }

    const seen = new Set();
    const posts = [];
    for (const post of rawPosts) {
      if (!seen.has(post.url)) {
        seen.add(post.url);
        posts.push(post);
        if (posts.length >= limit) break;
      }
    }

    return {
      userId: userId,
      postsUrl: postsUrl,
      total: posts.length,
      posts: posts
    };
  } finally {
    await page.close();
  }
}
