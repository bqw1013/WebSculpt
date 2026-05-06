export default async (page, params) => {
  const user = params.user;
  const limit = parseInt(params.limit, 10);

  const userId = user
    .replace(/^https?:\/\/www\.zhihu\.com\/people\//, '')
    .replace(/\/.*$/, '');
  const postsUrl = 'https://www.zhihu.com/people/' + userId + '/posts';

  await page.goto(postsUrl, { waitUntil: 'networkidle' });

  const selectors = ['.ContentItem', '.List-item'];
  let selectorFound = false;
  let rawPosts = [];

  for (const selector of selectors) {
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
};
