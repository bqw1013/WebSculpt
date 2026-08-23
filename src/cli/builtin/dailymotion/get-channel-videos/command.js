// dailymotion/get-channel-videos: video stream of a Dailymotion topic channel,
// or the site-wide trending stream when no channel is given.
// Single source of truth: public REST API api.dailymotion.com (no login, no browser).
//   - channel specified: /channel/{slug}/videos?sort={sort}
//   - channel omitted:   /videos?sort={sort}        (site-wide trending, default trending)
// NOTE: the API returns dotted field names as LITERAL single keys
// (e.g. "owner.screenname" is one key, accessed via v["owner.screenname"]).

const API_BASE = "https://api.dailymotion.com";
const FIELDS = "id,title,url,duration,thumbnail_240_url,owner.screenname,created_time,views_total";

// 17 fixed topic channels (slug -> English display name), verified from /channels.
const CHANNEL_NAMES = {
	animals: "Animals",
	auto: "Cars",
	people: "Celeb",
	fun: "Comedy & Entertainment",
	creation: "Creative",
	school: "Education",
	videogames: "Gaming",
	kids: "Kids",
	lifestyle: "Lifestyle & How-to",
	shortfilms: "Movies",
	music: "Music",
	news: "News",
	sport: "Sports",
	tech: "Tech",
	travel: "Travel",
	tv: "TV",
	webcam: "Webcam"
};

const SORTS = ["trending", "visited", "recent"];

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Random 200-700ms before each API request (rate-limit courtesy; no observed throttling).
function randomDelay() {
	return sleep(200 + Math.floor(Math.random() * 501));
}

// Validate the raw string BEFORE parsing to avoid parseInt truncation.
function parseLimit(raw) {
	if (raw === undefined || raw === null || raw === "") return 20;
	if (!/^\d+$/.test(raw)) {
		const err = new Error("[INVALID_PARAM] limit must be an integer between 1 and 100, got \"" + raw + "\"");
		err.code = "INVALID_PARAM";
		throw err;
	}
	const n = parseInt(raw, 10);
	if (n < 1 || n > 100) {
		const err = new Error("[INVALID_PARAM] limit must be between 1 and 100, got " + n);
		err.code = "INVALID_PARAM";
		throw err;
	}
	return n;
}

function publishedAgo(createdTime) {
	const diff = Math.floor(Date.now() / 1000) - createdTime;
	if (diff < 3600) return Math.max(1, Math.floor(diff / 60)) + "m ago";
	if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
	if (diff < 86400 * 30) return Math.floor(diff / 86400) + "d ago";
	if (diff < 86400 * 365) return Math.floor(diff / (86400 * 30)) + " mo ago";
	return Math.floor(diff / (86400 * 365)) + " y ago";
}

function mapVideo(v) {
	const created = v.created_time;
	return {
		id: v.id,
		title: v.title,
		url: v.url,
		duration: v.duration,
		thumbnail: v.thumbnail_240_url,
		owner: v["owner.screenname"] ?? null,
		views: v.views_total ?? null,
		publishedAt: new Date(created * 1000).toISOString(),
		publishedAgo: publishedAgo(created)
	};
}

async function fetchPage(path, perPage) {
	await randomDelay();
	const url = API_BASE + "/" + path + "&fields=" + encodeURIComponent(FIELDS) + "&limit=" + perPage;
	let res;
	try {
		res = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
			},
			redirect: "follow"
		});
	} catch (e) {
		const err = new Error("[REQUEST_FAILED] Failed to fetch Dailymotion API: " + (e && e.message ? e.message : String(e)));
		err.code = "REQUEST_FAILED";
		throw err;
	}
	if (!res.ok) {
		const err = new Error("[REQUEST_FAILED] Dailymotion API request failed with HTTP " + res.status);
		err.code = "REQUEST_FAILED";
		throw err;
	}
	return res.json();
}

export default async function (params) {
	let channel = params.channel;
	if (channel !== undefined && channel !== null && channel.trim() !== "") {
		channel = channel.trim();
		if (!Object.prototype.hasOwnProperty.call(CHANNEL_NAMES, channel)) {
			const err = new Error("[INVALID_PARAM] Unknown channel \"" + channel + "\". Valid values: " + Object.keys(CHANNEL_NAMES).join(", "));
			err.code = "INVALID_PARAM";
			throw err;
		}
	} else {
		channel = null;
	}

	let sort = params.sort !== undefined && params.sort !== null && params.sort.trim() !== "" ? params.sort.trim() : "trending";
	if (!SORTS.includes(sort)) {
		const err = new Error("[INVALID_PARAM] sort must be one of " + SORTS.join(", ") + ", got \"" + sort + "\"");
		err.code = "INVALID_PARAM";
		throw err;
	}

	const limit = parseLimit(params.limit);

	const basePath = channel
		? "channel/" + channel + "/videos?sort=" + sort
		: "videos?sort=" + sort;

	const videos = [];
	let page = 1;
	let hasMore = true;

	while (videos.length < limit && hasMore) {
		const remaining = limit - videos.length;
		const perPage = Math.min(100, remaining);
		const data = await fetchPage(basePath + "&page=" + page, perPage);
		const list = Array.isArray(data.list) ? data.list : [];
		for (const v of list) {
			videos.push(mapVideo(v));
			if (videos.length >= limit) break;
		}
		hasMore = data.has_more === true && list.length > 0;
		page += 1;
	}

	return {
		channel: channel ? { slug: channel, name: CHANNEL_NAMES[channel] } : null,
		videos,
		partial: videos.length < limit
	};
}
