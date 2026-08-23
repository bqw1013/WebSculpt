// vimeo/search — node runtime
// Search public Vimeo content across five types (video/ondemand/people/channel/group).
// Auth: anonymous JWT pulled from vimeo.com/watch viewer-bootstrap, then direct calls to
// api.vimeo.com/search. sort/time are real API params (no ignored placeholders).
//
// Polite pacing: random 200-700ms sleep before each request; 60s timeout with one retry.

const MAX_LIMIT = 100;
const PAGE_SIZE = 24;
const MAX_PAGES = 12;
const REQUEST_TIMEOUT = 60000;
const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

const VALID_TYPES = ["video", "ondemand", "people", "channel", "group"];
const API_KIND = { video: "clip", ondemand: "ondemand", people: "people", channel: "channel", group: "group" };

// sort 可选值按 type 划分（UI 排序下拉逐 type 实测；非法组合 API 返回 400）
// 全类型：relevance（相关性）、popular（最热门）
// video/ondemand：latest（最近上传）、title_asc/title_desc（标题 A-Z/Z-A）、longest/shortest（时长最长/最短）
// channel/group：latest、name_asc/name_desc（名称 A-Z/Z-A）
// people：name_asc/name_desc（无 latest、无 duration）
const SORT_OPTIONS = {
	video: ["relevance", "popular", "latest", "title_asc", "title_desc", "longest", "shortest"],
	ondemand: ["relevance", "popular", "latest", "title_asc", "title_desc", "longest", "shortest"],
	channel: ["relevance", "popular", "latest", "name_asc", "name_desc"],
	group: ["relevance", "popular", "latest", "name_asc", "name_desc"],
	people: ["relevance", "popular", "name_asc", "name_desc"],
};

// sort 值 → API sort/direction 参数
const SORT_API = {
	popular: { sort: "popularity", direction: "desc" },
	latest: { sort: "latest", direction: "desc" },
	title_asc: { sort: "alphabetical", direction: "asc" },
	title_desc: { sort: "alphabetical", direction: "desc" },
	longest: { sort: "duration", direction: "desc" },
	shortest: { sort: "duration", direction: "asc" },
	name_asc: { sort: "alphabetical", direction: "asc" },
	name_desc: { sort: "alphabetical", direction: "desc" },
};

// time 可选值：all（全部）/ day（最近24小时）/ week（最近7天）/ month（最近30天）/ year（最近365天）
// 仅 filter_type=clip 有效，其余 type 传 filter_uploaded 会 400
const VALID_TIMES = ["all", "day", "week", "month", "year"];
const TIME_API = { day: "today", week: "this-week", month: "this-month", year: "this-year" };

// 各 type 的 fields（返回 data[] 内的原生键 clip/ondemand/people/channel/group）
const FIELDS = {
	clip: "clip.name,clip.pictures,clip.user.name,clip.user.pictures.sizes,clip.metadata.connections,clip.metadata.interactions.watchlater.added,clip.uri,clip.stats.plays,clip.duration,clip.created_time,clip.link,clip.badge.type,facet.type",
	ondemand: "ondemand.name,ondemand.uri,ondemand.link,ondemand.type,ondemand.duration,ondemand.user.name,ondemand.pictures,facet.type",
	people: "people.name,people.uri,people.link,people.location_details,people.metadata.connections.followers.total,people.pictures,facet.type",
	channel: "channel.name,channel.uri,channel.link,channel.metadata.connections.videos.total,channel.pictures,facet.type",
	group: "group.name,group.uri,group.link,group.metadata.connections.videos.total,group.pictures,facet.type",
};

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function randomWait(min, max) {
	const ms = min + Math.floor(Math.random() * (max - min + 1));
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function httpGet(url, headers = {}, timeoutMs = REQUEST_TIMEOUT) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			headers: { "user-agent": UA, "accept-language": "en", ...headers },
			redirect: "follow",
			signal: controller.signal,
		});
		const text = await res.text();
		return { status: res.status, text };
	} finally {
		clearTimeout(timer);
	}
}

// 匿名 JWT 来源：/search 页对 node 是 403 CAPTCHA，不可用；/watch 可达且内嵌 viewer-bootstrap。
// 失败后回退 /channels/staffpicks。
async function fetchJwt() {
	const sources = ["https://vimeo.com/watch", "https://vimeo.com/channels/staffpicks"];
	let lastError = null;
	for (const source of sources) {
		await randomWait(200, 700);
		try {
			const res = await httpGet(source, { accept: "text/html,application/xhtml+xml" });
			if (res.status !== 200) {
				lastError = new Error(`HTTP ${res.status} from ${source}`);
				continue;
			}
			const match = res.text.match(/<script id="viewer-bootstrap"[^>]*>([\s\S]*?)<\/script>/);
			if (!match) {
				lastError = new Error(`viewer-bootstrap script not found in ${source}`);
				continue;
			}
			const data = JSON.parse(match[1]);
			if (!data.jwt) {
				lastError = new Error(`jwt field missing in ${source}`);
				continue;
			}
			return data.jwt;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
		}
	}
	fail("JWT_FETCH_FAILED", `Unable to obtain anonymous JWT from vimeo.com: ${lastError ? lastError.message : "unknown"}`);
}

async function callApi(jwt, type, query, pageNumber, sort, time, isRetry) {
	const queryParams = new URLSearchParams({
		filter_type: API_KIND[type],
		query,
		page: String(pageNumber),
		per_page: String(PAGE_SIZE),
		facets: "type",
		precision: "0",
		fuzzy: "true",
		fields: FIELDS[API_KIND[type]],
	});
	const sortMap = SORT_API[sort];
	if (sortMap) {
		queryParams.set("sort", sortMap.sort);
		queryParams.set("direction", sortMap.direction);
	}
	if (time !== "all") queryParams.set("filter_uploaded", TIME_API[time]);

	const url = `https://api.vimeo.com/search?${queryParams.toString()}`;
	await randomWait(200, 700);
	let res;
	try {
		res = await httpGet(url, {
			accept: "application/vnd.vimeo.*+json;version=3.3",
			authorization: `jwt ${jwt}`,
			referer: "https://vimeo.com/",
			"content-type": "application/json",
		});
	} catch (error) {
		if (!isRetry) {
			await randomWait(500, 1000);
			return callApi(jwt, type, query, pageNumber, sort, time, true);
		}
		fail("API_TIMEOUT", `api.vimeo.com/search timed out: ${error.message}`);
	}
	if (res.status === 401) {
		// JWT 失效/过期：重新取 JWT 再试一次
		if (!isRetry) {
			await randomWait(500, 1000);
			const freshJwt = await fetchJwt();
			return callApi(freshJwt, type, query, pageNumber, sort, time, true);
		}
		fail("AUTH_REQUIRED", `api.vimeo.com/search returned 401`);
	}
	if (res.status !== 200) {
		fail("API_ERROR", `api.vimeo.com/search HTTP ${res.status}`);
	}
	let body;
	try {
		body = JSON.parse(res.text);
	} catch (error) {
		fail("DRIFT_DETECTED", `api.vimeo.com/search response is not JSON: ${error.message}`);
	}
	return body;
}

function identity(native, type) {
	const uri = native.uri || native.link || null;
	const url = native.link || (native.uri ? `https://vimeo.com${native.uri}` : null);
	const id = native.uri ? native.uri.split("/").filter(Boolean).pop() : url;
	const result = { kind: type, id: id || null, title: native.name || null, name: native.name || null, url, native };
	if (type === "video") {
		result.duration = native.duration ?? null;
		result.createdAt = native.created_time || null;
		result.pictures = native.pictures || null;
		result.stats = native.stats || null;
		result.metadata = native.metadata || null;
		result.user = native.user || null;
		result.badge = native.badge || null;
	} else if (type === "people") {
		result.location = native.location_details || null;
		result.publicVideos = native.metadata?.public_videos || null;
		result.followers = native.metadata?.connections?.followers || null;
		result.pictures = native.pictures || null;
		result.skills = native.skills || null;
		result.backgroundVideo = native.background_video || null;
	} else if (type === "channel" || type === "group") {
		result.pictures = native.pictures || null;
		result.metadata = native.metadata || null;
	} else {
		result.pictures = native.pictures || null;
		result.metadata = native.metadata || null;
	}
	return result;
}

function parseBody(body, type) {
	if (!body || !Array.isArray(body.data)) throw new Error("Vimeo search response schema missing data array");
	const kind = API_KIND[type];
	const records = [];
	for (const entry of body.data) {
		const native = entry && entry[kind];
		if (native && typeof native === "object") records.push(identity(native, type));
	}
	return records;
}

function envelope(body) {
	return {
		total: body.total ?? null,
		page: body.page ?? null,
		perPage: body.per_page ?? null,
		paging: body.paging || null,
		facets: body.facets || null,
		parameters: body.parameters || null,
		searchId: body.search_id ?? null,
		streamId: body.stream_id ?? null,
		matureHiddenCount: body.mature_hidden_count ?? null,
	};
}

export default async function (params) {
	const query = typeof params.query === "string" ? params.query.trim() : "";
	if (!query) fail("MISSING_PARAM", "query is required");

	const type = String(params.type).toLowerCase();
	if (!VALID_TYPES.includes(type)) fail("INVALID_PARAM", `type must be one of ${VALID_TYPES.join(", ")}`);

	// 数字参数：先正则校验原始串再转换，禁止 parseInt 截断
	const rawLimit = String(params.limit).trim();
	if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(rawLimit);
	if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

	const sort = String(params.sort).toLowerCase();
	const validSorts = SORT_OPTIONS[type];
	if (!validSorts.includes(sort)) {
		fail("INVALID_PARAM", `sort must be one of ${validSorts.join(", ")} for type ${type}`);
	}

	const time = String(params.time).toLowerCase();
	if (!VALID_TIMES.includes(time)) fail("INVALID_PARAM", `time must be one of ${VALID_TIMES.join(", ")}`);
	if (type !== "video" && time !== "all") {
		fail("INVALID_PARAM", `time is only supported for type=video (got ${time} with type=${type})`);
	}

	let jwt;
	try {
		jwt = await fetchJwt();
	} catch (error) {
		throw error;
	}

	const records = [];
	const seen = new Set();
	let firstBody = null;
	let pagesFetched = 0;
	let total = null;
	for (let pageNumber = 1; pageNumber <= MAX_PAGES && records.length < limit; pageNumber += 1) {
		const body = await callApi(jwt, type, query, pageNumber, sort, time, false);
		if (!firstBody) firstBody = body;
		pagesFetched = pageNumber;
		total = body.total ?? null;
		if (body.data.length > 0) {
			const pageRecords = parseBody(body, type);
			if (pageRecords.length === 0) {
				throw new Error("Vimeo search response has no selected native records");
			}
			for (const record of pageRecords) {
				const key = `${type}:${record.id}`;
				if (!seen.has(key)) {
					seen.add(key);
					records.push(record);
				}
			}
		}
		if (!body.data.length || !body.paging?.next) break;
	}
	if (!firstBody) fail("EMPTY_RESULT", `Vimeo search returned no data for query "${query}"`);
	if (records.length === 0) fail("EMPTY_RESULT", `Vimeo search returned no records for query "${query}"`);

	return {
		query,
		type,
		sort,
		time,
		maxLimit: MAX_LIMIT,
		total,
		resultCount: Math.min(records.length, limit),
		pagesFetched,
		results: records.slice(0, limit),
		source: "api",
		fallbackUsed: false,
		nativeEnvelope: envelope(firstBody),
	};
}
