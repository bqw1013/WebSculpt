// vimeo/get-channel — list videos in a Vimeo channel (SSR HTML, node runtime)
const MAX_LIMIT = 100;
const PAGE_SIZE = 12;
const MAX_PAGES = 12;
// Sort orders (mirror the channel page sort bar, 频道页排序控件全值):
//   preset       默认，策展顺序 (the curator's ordering)
//   date         最新发布 (newest)
//   alphabetical 标题字母序 (A–Z)
//   plays        最多播放 (most viewed)
//   likes        最多点赞 (most liked)
//   duration     时长最长 (longest first)
const VALID_SORTS = ["preset", "date", "alphabetical", "plays", "likes", "duration"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ACCEPT_HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const ACCEPT_LANGUAGE = "en-US,en;q=0.9";

const NAMED_ENTITIES = {
	amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
	hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
	ndash: "–", mdash: "—", bull: "•", middot: "·",
	copy: "©", reg: "®", deg: "°", trade: "™",
	pound: "£", euro: "€", yen: "¥", cent: "¢",
	sect: "§", para: "¶", times: "×", divide: "÷", plusmn: "±",
	agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ",
	ccedil: "ç", egrave: "è", eacute: "é", ecirc: "ê", euml: "ë",
	igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
	ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø",
	ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý", yuml: "ÿ", szlig: "ß",
	sup2: "²", sup3: "³", micro: "µ", cedil: "¸", ordm: "º", ordf: "ª", not: "¬"
};

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomWait(min, max) {
	return sleep(min + Math.floor(Math.random() * (max - min + 1)));
}

// Decode HTML entities (named + numeric). Two passes handle Vimeo's occasional double-encoding.
function decodeEntities(input) {
	if (!input) return "";
	let out = String(input);
	for (let i = 0; i < 2; i += 1) {
		out = out.replace(/&#(\d+);/g, (_, n) => {
			try { return String.fromCodePoint(Number(n)); } catch { return `&#${n};`; }
		});
		out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
			try { return String.fromCodePoint(parseInt(h, 16)); } catch { return `&#x${h};`; }
		});
		out = out.replace(/&([a-zA-Z][a-zA-Z0-9]{0,10});/g, (match, name) => NAMED_ENTITIES[name] ?? match);
	}
	return out;
}

function listUrl(channel, pageNumber, sort) {
	return `https://vimeo.com/channels/${channel}/videos/page:${pageNumber}/sort:${sort}/format:detail`;
}

async function fetchPage(channel, pageNumber, sort) {
	// Polite pacing: random pause before every request.
	await randomWait(200, 700);
	const url = listUrl(channel, pageNumber, sort);
	let response;
	try {
		response = await fetch(url, {
			headers: { "User-Agent": UA, Accept: ACCEPT_HTML, "Accept-Language": ACCEPT_LANGUAGE },
			redirect: "follow"
		});
	} catch (error) {
		fail("NETWORK_ERROR", `Failed to reach Vimeo: ${error.message}`);
	}
	if (response.status === 404) fail("NOT_FOUND", `channel "${channel}" not found (HTTP 404)`);
	if (response.status === 429) fail("RATE_LIMITED", "Vimeo rate-limited the request (HTTP 429)");
	if (response.status === 403) fail("ACCESS_DENIED", "Vimeo denied access (HTTP 403)");
	if (!response.ok) fail("DRIFT_DETECTED", `Vimeo returned HTTP ${response.status}`);
	return { url, html: await response.text() };
}

function parseChannelInfo(html) {
	const header = html.match(/<header id="page_header">\s*<h1>([\s\S]*?)<\/h1>/);
	const link = header ? header[1].match(/<a href="(\/channels\/[^"]+)">([\s\S]*?)<\/a>/) : null;
	const meta = html.match(/<meta name="description" content="([^"]*)"/);
	const stats = [...html.matchAll(/<p class="super_link_list_title">([^<]+)<\/p>/g)].map((m) => m[1].trim());
	const owner = html.match(/by <a href="(\/[^"]+)">([\s\S]*?)<\/a>/);
	const subject = html.match(/data-subject-id="([0-9]+)"/);
	return {
		name: link ? decodeEntities(link[2]).trim() : null,
		url: link ? `https://vimeo.com${link[1]}` : null,
		description: meta ? decodeEntities(meta[1]) : null,
		videoCount: stats[0] || null,
		followerCount: stats[1] || null,
		moderatorCount: stats[2] || null,
		owner: owner ? { name: decodeEntities(owner[2]).trim(), url: `https://vimeo.com${owner[1]}` } : null,
		channelId: subject ? subject[1] : null
	};
}

function parseClips(html) {
	const clips = [];
	const pattern = /<li[^>]*id="clip_([0-9]+)"[^>]*>([\s\S]*?)<\/li>/g;
	let match;
	while ((match = pattern.exec(html)) !== null) {
		const id = match[1];
		const card = match[2];
		const titleA = card.match(/<p class="title">\s*<a href="(\/channels\/[^"]+)">([\s\S]*?)<\/a>/);
		const duration = card.match(/<div class="duration">([^<]+)<\/div>/);
		const author = card.match(/from <a href="(\/[^"]+)">([\s\S]*?)<\/a>/);
		const added = card.match(/<time datetime="([^"]+)"/);
		const views = card.match(/title="Views">\s*([^<\s]+)/);
		const likes = card.match(/title="Likes">\s*([^<\s]+)/);
		const comments = card.match(/title="Comments">\s*([^<\s]+)/);
		const thumbnail = card.match(/<img[^>]*src="([^"]*vimeocdn[^"]*)"/);
		const description = card.match(/<p class="description">([\s\S]*?)<\/p>/);
		const more = card.match(/href="(\/[0-9]+)" class="more"/);
		clips.push({
			id,
			title: titleA ? decodeEntities(titleA[2]).trim() : null,
			url: titleA ? `https://vimeo.com${titleA[1]}` : null,
			canonicalUrl: more ? `https://vimeo.com${more[1]}` : null,
			duration: duration ? duration[1] : null,
			author: author ? { name: decodeEntities(author[2]).trim(), url: `https://vimeo.com${author[1]}` } : null,
			addedAt: added ? added[1] : null,
			views: views ? views[1] : null,
			likes: likes ? likes[1] : null,
			comments: comments ? comments[1] : null,
			thumbnail: thumbnail ? thumbnail[1].replace(/&amp;/g, "&") : null,
			description: description ? decodeEntities(description[1]).trim() : null
		});
	}
	return clips;
}

function hasNextPage(html) {
	return /<link rel="next" href="/.test(html);
}

function isNotFoundPage(html) {
	const title = html.match(/<title>([\s\S]*?)<\/title>/);
	return Boolean(title && title[1].includes("Page Not Found"));
}

export default async function (params) {
	const channel = String(params.channel || "").trim();
	const sort = String(params.sort || "").toLowerCase();
	const rawLimit = String(params.limit || "").trim();

	if (!channel) fail("MISSING_PARAM", "channel is required");
	if (!/^[a-zA-Z0-9_-]{1,80}$/.test(channel)) fail("INVALID_PARAM", "channel must be a slug like 'staffpicks'");
	if (!VALID_SORTS.includes(sort)) fail("INVALID_PARAM", `sort must be one of ${VALID_SORTS.join(", ")}`);
	if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(rawLimit);
	if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

	const videos = [];
	const seen = new Set();
	let channelInfo = null;
	let pagesFetched = 0;
	let exhausted = false;

	for (let page = 1; page <= MAX_PAGES && videos.length < limit; page += 1) {
		const { html } = await fetchPage(channel, page, sort);
		pagesFetched = page;

		if (channelInfo === null) {
			if (isNotFoundPage(html)) fail("NOT_FOUND", `channel "${channel}" not found`);
			channelInfo = parseChannelInfo(html);
			if (!channelInfo.name) fail("DRIFT_DETECTED", "channel header (#page_header h1) not found — page structure changed");
		}

		const clips = parseClips(html);
		if (page === 1 && clips.length === 0) fail("EMPTY_RESULT", `channel "${channel}" has no videos`);
		for (const clip of clips) {
			if (!seen.has(clip.id)) {
				seen.add(clip.id);
				videos.push(clip);
			}
		}
		if (!hasNextPage(html) || clips.length < PAGE_SIZE) {
			exhausted = true;
			break;
		}
	}

	const trimmed = videos.slice(0, limit);
	return {
		channel: channelInfo,
		sort,
		requestedLimit: limit,
		resultCount: trimmed.length,
		pagesFetched,
		partial: exhausted && trimmed.length < limit,
		videos: trimmed
	};
}
