export default async (page, params) => {
  const url = params.url;

  if (!url) {
    throw new Error('[MISSING_PARAM] Parameter "url" is required.');
  }

  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForSelector('.RichText', { timeout: 15000 });

  const result = await page.evaluate(() => {
    const title = document.querySelector('h1')?.innerText?.trim()
      || document.querySelector('.Post-Title')?.innerText?.trim()
      || '';

    const timeText = document.querySelector('.ContentItem-time')?.innerText?.trim() || '';

    const content = document.querySelector('.RichText')?.innerText?.trim() || '';

    const actionsEl = document.querySelector('.ContentItem-actions');
    let agree = 0;
    let comment = 0;
    let share = 0;

    if (actionsEl) {
      const text = actionsEl.innerText || '';
      const nums = text.match(/\d+/g)?.map(Number) || [];
      if (nums.length >= 1) agree = nums[0];
      if (nums.length >= 2) comment = nums[1];
      if (nums.length >= 3) share = nums[2];
    }

    return { title, timeText, content, agree, comment, share };
  });

  if (!result.content) {
    throw new Error('[EMPTY_RESULT] Could not extract article content. The page structure may have changed or the article is not accessible.');
  }

  let publishedAt = '';
  let location = '';
  const timeMatch = result.timeText.match(/(?:发布于|编辑于)\s+(.+?)\s*・\s*(.+)/);
  if (timeMatch) {
    publishedAt = timeMatch[1].trim();
    location = timeMatch[2].trim();
  } else {
    publishedAt = result.timeText;
  }

  return {
    title: result.title,
    publishedAt,
    location,
    content: result.content,
    stats: {
      agree: result.agree,
      comment: result.comment,
      share: result.share,
    },
  };
};
