// vimeo/get-trending — 取 Vimeo 公开发现首页 "See what's trending" 区块的视频列表。
// 数据源：api.vimeo.com/curation_components/2/videos（/watch 的 trending curation component，source_type=popular）。
// 认证：先 GET vimeo.com/watch 的 SSR HTML 提取 viewerBootstrap.jwt（TTL 约 6 分钟），再带 `Authorization: jwt <token>` 调 API。
// 限速/礼貌 pacing：每次网络请求前随机 sleep 200-700ms。仅使用 Node 内置能力（全局 fetch），无第三方依赖。

const MAX_LIMIT = 100; // limit 上限，与 search/get-category/get-channel 系列一致
const MAX_JWT_RETRIES = 2; // JWT 失效后重取 token 的最大重试次数（含首次失败重试）
const WATCH_URL = "https://vimeo.com/watch";
const TRENDING_API_URL = "https://api.vimeo.com/curation_components/2/videos";
// 最小可用字段子集（已在探索阶段实测 200 正常；注意 uri 必须显式请求，否则 API 不回传该字段、
// 无法提取视频 id）：
// uri->id, name->title, link->url, duration->duration, created_time->createdAt, stats.plays->views,
// pictures.sizes.link->thumbnail, user.name/user.link->author, badge.type->badge
const API_FIELDS = "uri,name,link,duration,created_time,stats.plays,pictures.sizes.link,user.name,user.link,badge.type";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// 业务错误：大写蛇形错误码，随消息一起抛出，runner 会以 error.code 分类
function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// 限速/礼貌 pacing：每次请求前调用，随机 200-700ms
async function randomSleep() {
	await sleep(200 + Math.floor(Math.random() * 501));
}

// GET /watch 提取 viewerBootstrap.jwt（token 用于后续 API 调用）
async function fetchWatchJwt() {
	await randomSleep();
	const res = await fetch(WATCH_URL, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
			"Cache-Control": "no-cache",
			"Pragma": "no-cache"
		}
	});
	if (!res.ok) fail("HTTP_ERROR", `GET ${WATCH_URL} returned HTTP ${res.status}`);
	const html = await res.text();
	const match = html.match(/"jwt":"([^"]+)"/);
	if (!match || !match[1]) fail("DRIFT_DETECTED", "viewerBootstrap.jwt not found in /watch HTML");
	return match[1];
}

// 调 trending API 翻页；401 视为 JWT 失效/被拒，抛 JWT_EXPIRED 由上层重取 token 后重试
async function fetchTrendingPage(jwt, page, perPage) {
	await randomSleep();
	const url = `${TRENDING_API_URL}?sizes=640&per_page=${perPage}&page=${page}&fields=${encodeURIComponent(API_FIELDS)}`;
	const res = await fetch(url, {
		headers: {
			"User-Agent": USER_AGENT,
			"Accept": "application/json",
			"Accept-Language": "en",
			"Authorization": `jwt ${jwt}`
		}
	});
	if (res.status === 401) fail("JWT_EXPIRED", "trending API rejected the JWT (401)");
	if (!res.ok) fail("HTTP_ERROR", `GET ${TRENDING_API_URL} returned HTTP ${res.status}`);
	const body = await res.json();
	if (!body || !Array.isArray(body.data)) fail("DRIFT_DETECTED", "trending API response missing data array");
	return body;
}

// 把 API 原生记录映射为契约输出字段
function toResult(native) {
	const id = native && native.uri ? native.uri.split("/").filter(Boolean).pop() : null;
	return {
		id: id || null,
		title: native && native.name ? native.name : null,
		url: native && native.link ? native.link : id ? `https://vimeo.com/${id}` : null,
		duration: native && typeof native.duration === "number" ? native.duration : null,
		createdAt: native && native.created_time ? native.created_time : null,
		views: native && native.stats && typeof native.stats.plays === "number" ? native.stats.plays : null,
		thumbnail: native && native.pictures && Array.isArray(native.pictures.sizes) && native.pictures.sizes[0] ? native.pictures.sizes[0].link : null,
		author: native && native.user ? { name: native.user.name || null, url: native.user.link || null } : null,
		badge: native && native.badge ? native.badge.type : null
	};
}

export default async function(params) {
	// 数字参数先正则校验原始串再转换，禁止 parseInt 截断（"12abc" 之类必须拒绝）
	const rawLimit = String(params.limit).trim();
	if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(rawLimit);
	if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

	// 单页 per_page 取 min(limit, 100)，通常一页即可满足；total=2000 >> 100，partial 基本不触发
	const perPage = Math.min(limit, MAX_LIMIT);

	// 获取 JWT；失败先重试一次（网络抖动），仍失败则报错
	let jwt = null;
	let lastJwtError = null;
	for (let attempt = 0; attempt < MAX_JWT_RETRIES; attempt += 1) {
		try {
			jwt = await fetchWatchJwt();
			break;
		} catch (error) {
			lastJwtError = error;
			jwt = null;
		}
	}
	if (!jwt) throw lastJwtError;

	const results = [];
	const seen = new Set();
	let firstBody = null;
	let pagesFetched = 0;
	let total = null;

	// 翻页直到凑够 limit 或 API 不再给出下一页
	for (let page = 1; results.length < limit; page += 1) {
		let body;
		try {
			body = await fetchTrendingPage(jwt, page, perPage);
		} catch (error) {
			// JWT 失效/过期：重取 token 后重试当前页一次；其余错误原样抛出
			if (error && error.code === "JWT_EXPIRED") {
				jwt = await fetchWatchJwt();
				body = await fetchTrendingPage(jwt, page, perPage);
			} else {
				throw error;
			}
		}
		if (!firstBody) firstBody = body;
		pagesFetched = page;
		total = typeof body.total === "number" ? body.total : total;
		if (!body.data || !body.data.length) break;
		for (const entry of body.data) {
			const id = entry && entry.uri ? entry.uri.split("/").filter(Boolean).pop() : null;
			if (!id || seen.has(id)) continue;
			seen.add(id);
			results.push(toResult(entry));
		}
		if (!body.paging || !body.paging.next) break;
	}

	if (!firstBody) fail("EMPTY_RESULT", "trending API returned no pages");

	const output = {
		total: total ?? results.length,
		resultCount: results.length,
		pagesFetched,
		results: results.slice(0, limit),
		source: "api"
	};
	// total(2000) 恒大于 limit(<=100)，正常情况下 partial 不会出现；仅在 API 侧数据不足时置 true
	if (results.length < limit) output.partial = true;
	return output;
}
