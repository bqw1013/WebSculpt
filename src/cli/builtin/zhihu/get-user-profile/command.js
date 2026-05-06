export default async (page, params) => {
  const user = params.user;

  if (!user) {
    throw new Error('[MISSING_PARAM] Parameter "user" is required.');
  }

  const userId = user
    .replace(/^https?:\/\/www\.zhihu\.com\/people\//, '')
    .replace(/\/.*$/, '');
  const url = 'https://www.zhihu.com/people/' + userId;

  await page.goto(url, { waitUntil: 'networkidle' });

  const title = await page.title();
  if (title.includes('404') || title.includes('找不到') || title.includes('页面不见了')) {
    throw new Error('[NOT_FOUND] User not found');
  }

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent.includes('查看详细资料')
    );
    if (btn) btn.click();
  });

  await page.waitForTimeout(800);

  const profile = await page.evaluate(() => {
    const result = {
      name: '',
      headline: '',
      location: '',
      ipLocation: '',
      industry: '',
      education: [],
      followerCount: null,
      followeeCount: null,
      voteupCount: null,
      thankedCount: null,
      favoriteCount: null,
      answerCount: null,
      articleCount: null,
      pinCount: null,
      columnCount: null,
      videoCount: null,
      questionCount: null,
      collectionCount: null,
      underlineCount: null,
    };

    const bodyText = document.body.innerText;
    const lines = bodyText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

    // Blacklist for non-name labels
    const labelBlacklist = new Set([
      '所在行业',
      '居住地',
      '现居',
      '教育经历',
      '查看详细资料',
      '关注',
      '私信',
      '互相关注',
      '发私信',
      '动态',
      '回答',
      '文章',
      '想法',
      '专栏',
      '视频',
      '提问',
      '收藏',
      '划线',
      '关注订阅',
      '他的动态',
      '​',
    ]);

    // Extract name and headline from h1 (handles newline-separated name/headline)
    const h1 = document.querySelector('h1');
    if (h1) {
      const h1Parts = h1.innerText
        .trim()
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s && !labelBlacklist.has(s));
      if (h1Parts.length > 0) {
        result.name = h1Parts[0];
      }
      if (h1Parts.length > 1 && h1Parts[1].length <= 50) {
        result.headline = h1Parts[1];
      }
    }

    // Fallback name extraction from text near "IP 属地"
    if (!result.name) {
      const ipIndex = lines.findIndex((l) => l.startsWith('IP 属地'));
      if (ipIndex >= 0) {
        for (let i = ipIndex + 1; i < Math.min(lines.length, ipIndex + 5); i++) {
          const line = lines[i];
          if (
            line &&
            line.length <= 20 &&
            !labelBlacklist.has(line) &&
            !line.startsWith('现居')
          ) {
            result.name = line;
            break;
          }
        }
      }
    }

    // Fallback headline extraction: line right after name in text lines
    if (!result.headline && result.name) {
      const nameIdx = lines.indexOf(result.name);
      if (nameIdx >= 0 && nameIdx + 1 < lines.length) {
        const nextLine = lines[nameIdx + 1];
        if (
          nextLine &&
          nextLine.length <= 50 &&
          !labelBlacklist.has(nextLine) &&
          !nextLine.startsWith('现居') &&
          !nextLine.startsWith('IP')
        ) {
          result.headline = nextLine;
        }
      }
    }

    // Extract content counts from tab labels
    const countMap = {
      回答: 'answerCount',
      文章: 'articleCount',
      想法: 'pinCount',
      专栏: 'columnCount',
      视频: 'videoCount',
      提问: 'questionCount',
      收藏: 'collectionCount',
      划线: 'underlineCount',
    };

    for (const line of lines) {
      for (const [prefix, key] of Object.entries(countMap)) {
        if (line.startsWith(prefix)) {
          const numStr = line.substring(prefix.length).trim();
          if (/^\d+$/.test(numStr)) {
            result[key] = parseInt(numStr, 10);
          }
        }
      }
    }

    // Extract location
    const locationLine = lines.find((l) => l.startsWith('现居'));
    if (locationLine) {
      result.location = locationLine.replace('现居', '').trim();
    }
    const ipLine = lines.find((l) => l.startsWith('IP 属地'));
    if (ipLine) {
      result.ipLocation = ipLine.replace('IP 属地', '').trim();
    }

    // Extract industry
    const industryIdx = lines.findIndex((l) => l === '所在行业');
    if (industryIdx >= 0 && industryIdx + 1 < lines.length) {
      result.industry = lines[industryIdx + 1];
    }

    // Extract education
    const eduIdx = lines.findIndex((l) => l === '教育经历');
    if (eduIdx >= 0) {
      for (let i = eduIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line === '所在行业' || line === '居住地' || line === '查看详细资料') break;
        if (line.includes(' · ')) {
          const parts = line.split(' · ');
          if (parts.length === 2) {
            result.education.push({
              school: parts[0].trim(),
              major: parts[1].trim(),
            });
          }
        }
      }
    }

    // Extract numeric stats via TreeWalker
    const getNumNearKeyword = (keyword) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim() === keyword) {
          const parent = node.parentElement.parentElement || node.parentElement;
          const nums = parent.textContent.match(/\d{1,6}(?:,\d{3})*/g);
          return nums ? parseInt(nums[0].replace(/,/g, ''), 10) : null;
        }
      }
      return null;
    };

    result.followerCount = getNumNearKeyword('关注者');
    result.followeeCount = getNumNearKeyword('关注了');

    const getWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node;
    while ((node = getWalker.nextNode())) {
      const text = node.textContent.trim();
      const voteupMatch = text.match(/(\d{1,6}(?:,\d{3})*)\s*次赞同/);
      if (voteupMatch) {
        result.voteupCount = parseInt(voteupMatch[1].replace(/,/g, ''), 10);
      }
      const thankedMatch = text.match(/(\d{1,6}(?:,\d{3})*)\s*次喜欢/);
      if (thankedMatch) {
        result.thankedCount = parseInt(thankedMatch[1].replace(/,/g, ''), 10);
      }
      const favoriteMatch = text.match(/(\d{1,6}(?:,\d{3})*)\s*次收藏/);
      if (favoriteMatch) {
        result.favoriteCount = parseInt(favoriteMatch[1].replace(/,/g, ''), 10);
      }
    }

    return result;
  });

  if (!profile.name && !profile.followerCount && !profile.voteupCount) {
    throw new Error(
      '[DRIFT_DETECTED] Could not extract profile data; page structure may have changed'
    );
  }

  return { success: true, data: profile };
};
