// youtube/channel-info — lightweight channel profile card.
// Data source: window.ytInitialData on the channel home page (/@handle/).
//   - metadata.channelMetadataRenderer: name, full description, channelId, avatar, channelUrl
//   - header.pageHeaderRenderer.content.pageHeaderViewModel.metadata.contentMetadataViewModel.metadataRows:
//       handle (@...), subscribers, videoCount (locale-tolerant extraction)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeChannelUrl(input) {
	const s = (input || '').trim();
	if (!s) return '';
	// Form 2/3/4: full URL is used as-is.
	if (/^https?:\/\//i.test(s)) return s;
	// Form 1: bare @handle -> https://www.youtube.com/@handle
	if (s.startsWith('@')) return 'https://www.youtube.com/' + s;
	// Lenient: bare channel ID (UC + 22 chars) -> /channel/UC...
	if (/^UC[\w-]{22}$/.test(s)) return 'https://www.youtube.com/channel/' + s;
	// Lenient: URL without scheme.
	if (s.startsWith('youtube.com/') || s.startsWith('www.youtube.com/')) return 'https://' + s;
	// Lenient: bare name -> treat as handle.
	return 'https://www.youtube.com/@' + s;
}

export default async (page, params, cwd) => {
	const raw = (params.channel || '').trim();
	if (!raw) {
		const err = new Error('[MISSING_PARAM] Missing required parameter: channel (a @handle or channel URL)');
		err.code = 'MISSING_PARAM';
		throw err;
	}

	const url = normalizeChannelUrl(raw);

	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

	// Fail-first: wait until channel data is present OR the page reports 404.
	// Only then proceed; avoids waiting on a dead page until timeout.
	try {
		await page.waitForFunction(
			() => {
				const d = window.ytInitialData;
				if (!d) return /404/.test(document.title);
				return !!(d.metadata && d.metadata.channelMetadataRenderer) || /404/.test(document.title);
			},
			{ timeout: 30000 }
		);
	} catch (e) {
		const err = new Error('[CHANNEL_NOT_FOUND] YouTube channel not found or channel URL is invalid: ' + url);
		err.code = 'CHANNEL_NOT_FOUND';
		throw err;
	}

	// Polite pacing: human-like pause, random mouse move, small random scroll before reading data.
	await sleep(600 + Math.floor(Math.random() * 900));
	await page.mouse.move(150 + Math.floor(Math.random() * 500), 120 + Math.floor(Math.random() * 300));
	await sleep(150 + Math.floor(Math.random() * 350));

	const data = await page.evaluate(() => {
		const d = window.ytInitialData;
		if (!d || !d.metadata || !d.metadata.channelMetadataRenderer) {
			return { notFound: true, title: document.title };
		}
		const cm = d.metadata.channelMetadataRenderer;
		const pvm =
			d.header && d.header.pageHeaderRenderer && d.header.pageHeaderRenderer.content
				? d.header.pageHeaderRenderer.content.pageHeaderViewModel
				: null;
		if (!pvm) return { drift: true };

		const rows =
			pvm.metadata &&
			pvm.metadata.contentMetadataViewModel &&
			pvm.metadata.contentMetadataViewModel.metadataRows
				? pvm.metadata.contentMetadataViewModel.metadataRows
				: [];
		const parts = [];
		for (const row of rows) {
			for (const p of row.metadataParts || []) {
				if (p && p.text && typeof p.text.content === 'string') parts.push(p.text.content);
			}
		}

		const handle = parts.find((p) => p.startsWith('@')) || '';
		const subscribers = parts.find((p) => /位订阅|subscri/i.test(p)) || '';
		const videoCount = parts.find((p) => /个视频|视频$|videos?$/i.test(p)) || '';
		const avatar =
			cm.avatar && cm.avatar.thumbnails && cm.avatar.thumbnails[0] ? cm.avatar.thumbnails[0].url : null;
		const channelUrl = handle ? 'https://www.youtube.com/' + handle : cm.channelUrl || '';

		// Small random scroll to mimic a human glance (does not alter ytInitialData).
		const maxY = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
		if (maxY > 80) window.scrollTo(0, Math.floor(maxY * (0.03 + Math.random() * 0.04)));

		return {
			name: cm.title || '',
			handle,
			channelId: cm.externalId || '',
			url: channelUrl,
			avatar,
			subscribers,
			videoCount,
			description: cm.description || '',
		};
	});

	if (data.notFound) {
		const err = new Error('[CHANNEL_NOT_FOUND] YouTube channel not found or channel URL is invalid: ' + url);
		err.code = 'CHANNEL_NOT_FOUND';
		throw err;
	}
	if (data.drift) {
		const err = new Error(
			'[DRIFT_DETECTED] Channel page structure changed: expected pageHeaderViewModel under ytInitialData.header'
		);
		err.code = 'DRIFT_DETECTED';
		throw err;
	}

	return data;
};
