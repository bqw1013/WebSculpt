export default async (page, params) => {
  const user = params.user;
  const limit = parseInt(params.limit, 10);

  const userId = user
    .replace(/^https?:\/\/www\.zhihu\.com\/people\//, '')
    .replace(/\/.*$/, '');
  const activitiesUrl = 'https://www.zhihu.com/people/' + userId + '/activities';

  await page.goto(activitiesUrl, { waitUntil: 'networkidle' });

  try {
    await page.waitForSelector('.List-item', { timeout: 15000 });
  } catch (e) {
    throw new Error('[DRIFT_DETECTED] Activity list selector not found. Page structure may have changed.');
  }

  const rawActivities = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.List-item'));
    return items.map(item => {
      const meta = item.querySelector('.List-itemMeta');
      const type = meta ? meta.querySelector('.ActivityItem-metaTitle')?.textContent?.trim() || '' : '';
      const time = meta ? meta.querySelector('.ActivityItem-meta span:last-child')?.textContent?.trim() || '' : '';

      const contentItem = item.querySelector('.ContentItem');
      let title = '';
      let content = '';
      let url = '';

      if (contentItem) {
        const titleEl = contentItem.querySelector('.ContentItem-title');
        if (titleEl) {
          title = titleEl.textContent.trim();
        }

        const richContent = contentItem.querySelector('.RichContent-inner');
        if (richContent) {
          content = richContent.textContent.trim().replace(/\s+/g, ' ').slice(0, 300);
        }

        const pinLink = contentItem.querySelector('a[href*="/pin/"]');
        const articleLink = contentItem.querySelector('a[href*="/p/"]');
        const answerLink = contentItem.querySelector('a[href*="/question/"]');
        url = pinLink?.href || articleLink?.href || answerLink?.href || '';

        if (!title && content) {
          title = content.slice(0, 60);
        }
      }

      return { type, time, title, content: content.slice(0, 300), url };
    }).filter(a => a.type && (a.title || a.content));
  });

  if (rawActivities.length === 0) {
    throw new Error('[EMPTY_RESULT] No activities found for user "' + userId + '".');
  }

  const seen = new Set();
  const activities = [];
  for (const activity of rawActivities) {
    if (!seen.has(activity.url)) {
      seen.add(activity.url);
      activities.push(activity);
      if (activities.length >= limit) break;
    }
  }

  return {
    userId: userId,
    activitiesUrl: activitiesUrl,
    total: activities.length,
    activities: activities
  };
};
