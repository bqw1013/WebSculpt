const fail = (code, message) => {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
};

const extractPage = async (page, pageUrl) => page.evaluate((currentUrl) => {
	const rows = Array.from(document.querySelectorAll('tr.athing')).filter((row) => /^\d+$/.test(row.id));
	const absolute = (href) => href ? new URL(href, currentUrl).href : null;
	const linkByText = (row, text) => Array.from(row.querySelectorAll('a')).find((link) => link.textContent.trim() === text);
	const items = rows.map((row, index) => {
		const age = row.querySelector('.age');
		const rawTime = age?.getAttribute('title') || '';
		const timeParts = rawTime.trim().split(/\s+/);
		const createdAtUnix = Number(timeParts[1]);
		const createdAt = Number.isFinite(createdAtUnix)
			? new Date(createdAtUnix * 1000).toISOString()
			: (timeParts[0] ? `${timeParts[0]}Z` : null);
		const storyLink = row.querySelector('.onstory a');
		const storyHnUrl = absolute(storyLink?.getAttribute('href'));
		const storyId = storyHnUrl ? Number(new URL(storyHnUrl).searchParams.get('id')) : NaN;
		const parentLink = linkByText(row, 'parent');
		const contextLink = linkByText(row, 'context');
		const commentLink = age?.querySelector('a');
		const commentText = row.querySelector('.commtext')?.innerText?.trim() || '';
		const commentHtml = row.querySelector('.commtext')?.innerHTML || '';
		return {
			rank: index + 1,
			commentId: Number(row.id),
			commentText,
			commentHtml,
			author: row.querySelector('.hnuser')?.textContent?.trim() || null,
			createdAt,
			createdAtUnix: Number.isFinite(createdAtUnix) ? createdAtUnix : null,
			commentUrl: absolute(commentLink?.getAttribute('href')),
			parentUrl: absolute(parentLink?.getAttribute('href')),
			contextUrl: absolute(contextLink?.getAttribute('href')),
			storyId: Number.isFinite(storyId) ? storyId : null,
			storyTitle: storyLink?.textContent?.trim() || null,
			storyHnUrl,
		};
	});
	const more = Array.from(document.querySelectorAll('a')).find((link) => link.textContent.trim() === 'More');
	return {
		items,
		moreUrl: more ? absolute(more.getAttribute('href')) : null,
		isCommentsPage: Boolean(document.querySelector('a[href="newcomments"]')),
	};
}, pageUrl);

export default async (page, params, cwd) => {
	const limit = Number.parseInt(params.limit, 10);
	if (!Number.isInteger(limit) || String(limit) !== String(params.limit).trim() || limit < 1 || limit > 50) {
		fail('INVALID_PARAM', 'limit must be an integer from 1 to 50');
	}

	const items = [];
	const seenComments = new Set();
	const seenPages = new Set();
	let pageUrl = 'https://news.ycombinator.com/newcomments';

	while (items.length < limit) {
		if (seenPages.has(pageUrl)) fail('DRIFT_DETECTED', 'Pagination cursor repeated');
		seenPages.add(pageUrl);

		try {
			await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
		} catch (error) {
			fail('NETWORK_ERROR', `Unable to load ${pageUrl}: ${error.message}`);
		}

		let pageData;
		try {
			pageData = await extractPage(page, pageUrl);
		} catch (error) {
			fail('DRIFT_DETECTED', `Unable to inspect comments page: ${error.message}`);
		}

		if (!pageData.items.length) {
			if (items.length) break;
			if (pageData.isCommentsPage) fail('EMPTY_RESULT', 'No comments were available');
			fail('DRIFT_DETECTED', 'Expected Hacker News comments rows were not found');
		}

		for (const item of pageData.items) {
			if (!Number.isInteger(item.commentId) || !item.commentUrl || !item.createdAt || !Number.isInteger(item.storyId) || !item.storyHnUrl || !item.storyTitle) {
				fail('DRIFT_DETECTED', 'A comment row is missing a required field');
			}
			if (seenComments.has(item.commentId)) fail('DRIFT_DETECTED', `Duplicate comment ${item.commentId} across pages`);
			seenComments.add(item.commentId);
			item.rank = items.length + 1;
			items.push(item);
			if (items.length === limit) break;
		}

		if (items.length >= limit || !pageData.moreUrl) break;
		const next = new URL(pageData.moreUrl);
		if (next.origin !== 'https://news.ycombinator.com' || next.pathname !== '/newcomments' || !/^\d+$/.test(next.searchParams.get('next') || '')) {
			fail('DRIFT_DETECTED', 'The More link does not match Hacker News cursor pagination');
		}
		pageUrl = next.href;
	}

	return items;
};
