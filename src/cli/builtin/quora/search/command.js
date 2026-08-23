const MAX_LIMIT = 100;
const PAGE_SIZE = 10;
const PAGE_CAP = 12;
const TYPES = new Set(["all", "question", "answer", "post", "profile", "topic", "tribe"]);
const SORTS = new Set(["default", "latest", "popular"]);
const TIMES = new Set(["all", "hour", "day", "week", "month", "year"]);
const SEARCH_HASH = "deb8d8c3f230ef7568c0895df972ada793afb470ecd151e07453f7b7c0e51134";

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function randomBetween(min, max) {
	return Math.floor(min + Math.random() * (max - min + 1));
}

function absoluteUrl(value) {
	if (!value) return null;
	try { return new URL(value, "https://www.quora.com").toString(); } catch { return null; }
}

function qtextText(value) {
	if (value === null || value === undefined) return null;
	if (typeof value === "number") return String(value);
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === "object") return qtextText(parsed);
		} catch { /* Quora often sends plain strings for short fields. */ }
		return trimmed;
	}
	if (Array.isArray(value)) return value.map(qtextText).filter(Boolean).join("\n") || null;
	if (Array.isArray(value.sections)) return value.sections.map(qtextText).filter(Boolean).join("\n") || null;
	if (Array.isArray(value.spans)) return value.spans.map(span => span?.text || qtextText(span?.modifiers?.embed)).filter(Boolean).join("") || null;
	if (typeof value.text === "string") return value.text.trim() || null;
	return null;
}

function userName(user) {
	if (!user) return null;
	if (Array.isArray(user.names)) return user.names.map(name => [name?.givenName, name?.familyName].filter(Boolean).join(" ")).filter(Boolean).join(" ") || null;
	return null;
}

function userSummary(user) {
	if (!user) return null;
	return {
		id: user.id || null,
		uid: user.uid ?? null,
		name: userName(user),
		profileUrl: absoluteUrl(user.profileUrl),
		profileImageUrl: user.profileImageUrl || user.smallProfileImageUrl || null,
		followerCount: user.followerCount ?? null,
		bestCredential: user.bestCredential || null,
		native: user
	};
}

function metricsFor(value) {
	if (!value) return null;
	return {
		followers: value.followerCount ?? value.numFollowers ?? null,
		answers: value.answerCount ?? value.decanonicalizedAnswerCount ?? null,
		upvotes: value.numUpvotes ?? null,
		shares: value.numShares ?? null,
		comments: value.numDisplayComments ?? null,
		views: value.numViews ?? null
	};
}

function normalizeNode(node, requestedType) {
	// Quora's resultType is not reliable for answer/profile nodes: those
	// payloads are returned as question/user search results respectively.
	// Prefer the nested native payload so mixed (type=all) pages retain the
	// complete result shape as well as the requested filtered shapes.
	const kind = node?.previewAnswer
		? "answer"
		: node?.user
			? "profile"
			: node?.post
				? "post"
				: node?.topic
					? "topic"
					: node?.tribe
						? "tribe"
						: (node?.searchResultType || requestedType);
	const base = {
		kind,
		native: node,
		id: node?.objectId ?? node?.id ?? null,
		objectId: node?.objectId ?? null,
		title: null,
		name: null,
		url: null,
		content: null,
		excerpt: null,
		author: null,
		question: null,
		publishedAt: null,
		metrics: null
	};
	if (kind === "question") {
		const question = node.question || {};
		return { ...base, id: question.qid ?? node.objectId ?? question.id, questionId: question.qid ?? null, title: qtextText(question.title), url: absoluteUrl(question.url), publishedAt: question.creationTime ?? null, author: userSummary(question.asker), metrics: metricsFor(question), question: question };
	}
	if (kind === "answer") {
		const answer = node.previewAnswer || {};
		const question = node.question || answer.question || {};
		return { ...base, id: answer.aid ?? node.objectId ?? answer.id, answerId: answer.aid ?? null, questionId: question.qid ?? null, title: qtextText(question.title), url: absoluteUrl(answer.url), content: qtextText(answer.content), excerpt: qtextText(answer.content), author: userSummary(answer.author), question, publishedAt: answer.creationTime ?? null, metrics: metricsFor(answer) };
	}
	if (kind === "post") {
		const post = node.post || {};
		return { ...base, id: post.pid ?? node.objectId ?? post.id, postId: post.pid ?? null, title: qtextText(post.title) || qtextText(post.content)?.split("\n")[0] || null, url: absoluteUrl(post.url), content: qtextText(post.content), excerpt: qtextText(post.content), author: userSummary(post.author || post.tribeItem?.author), publishedAt: post.creationTime ?? null, metrics: metricsFor(post), tribe: post.tribe || post.tribeItem?.tribe || null };
	}
	if (kind === "profile") {
		const user = node.user || {};
		return { ...base, id: user.uid ?? node.objectId ?? user.id, userId: user.uid ?? null, name: userName(user), title: userName(user), url: absoluteUrl(user.profileUrl), author: userSummary(user), metrics: metricsFor(user), credential: user.bestCredential || null, image: user.profileImageUrl || null };
	}
	if (kind === "topic") {
		const topic = node.topic || {};
		return { ...base, id: topic.tid ?? node.objectId ?? topic.id, topicId: topic.tid ?? null, name: topic.name || null, title: topic.name || null, url: absoluteUrl(topic.url), image: topic.photoUrl || null, publishedAt: null, metrics: metricsFor(topic), topic };
	}
	if (kind === "tribe") {
		const tribe = node.tribe || {};
		return { ...base, id: tribe.tribeId ?? node.objectId ?? tribe.id, tribeId: tribe.tribeId ?? null, name: tribe.nameString || null, title: tribe.nameString || null, url: absoluteUrl(tribe.url), content: tribe.descriptionString || null, excerpt: tribe.descriptionString || null, image: tribe.iconUrl || tribe.smallIconUrl || null, metrics: metricsFor(tribe), tribe };
	}
	return base;
}

function resultKey(item, type) {
	const kind = item?.previewAnswer
		? "answer"
		: item?.user
			? "profile"
			: item?.post
				? "post"
				: item?.topic
					? "topic"
					: item?.tribe
						? "tribe"
						: (item?.searchResultType || type);
	const identity = kind === "answer"
		? item?.previewAnswer?.aid ?? item?.previewAnswer?.id
		: kind === "question"
			? item?.question?.qid ?? item?.question?.id
			: kind === "post"
				? item?.post?.pid ?? item?.post?.id
				: kind === "profile" || kind === "user"
					? item?.user?.uid ?? item?.user?.id
					: kind === "topic"
						? item?.topic?.tid ?? item?.topic?.id
						: kind === "tribe"
							? item?.tribe?.tribeId ?? item?.tribe?.id
							: item?.objectId ?? item?.id;
	return `${kind}:${identity ?? JSON.stringify(item)}`;
}

function searchUrl(query, type, sort, time) {
	const queryParams = new URLSearchParams({ q: query });
	if (type !== "all") queryParams.set("type", type);
	if (sort === "latest") queryParams.set("sortOrder", "time_descending");
	if (time !== "all") queryParams.set("time", time);
	return `https://www.quora.com/search?${queryParams.toString()}`;
}

function apiVariables(query, type, sort, time, first, after) {
	return {
		query,
		disableSpellCheck: null,
		resultType: type === "all" ? null : type,
		author: null,
		time: time === "all" ? "all_times" : time,
		sortOrder: sort === "latest" ? "time_descending" : "relevance",
		first,
		after: after ?? null,
		tribeId: null,
		tid: null
	};
}

async function lightHumanize(page, scroll = false) {
	try {
		const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
		if (page.mouse && viewport.width > 0 && viewport.height > 0) {
			await page.mouse.move(Math.floor(viewport.width * (0.35 + Math.random() * 0.3)), Math.floor(viewport.height * (0.2 + Math.random() * 0.35)), { steps: randomBetween(2, 4) });
			if (scroll && typeof page.mouse.wheel === "function") await page.mouse.wheel(0, randomBetween(80, 180));
		}
	} catch { /* best effort; extraction must remain deterministic. */ }
}

async function readGraphql(page, variables) {
	const response = await page.evaluate(async payload => {
		const globals = window.ansFrontendGlobals || {};
		const early = globals.earlySettings || {};
		const settings = globals.settings || {};
		const token = document.querySelector('input[name="cf-turnstile-response"]')?.value || "";
		const headers = {
			"content-type": "application/json",
			"quora-formkey": early.formkey || "",
			"quora-revision": settings.revision || "",
			"quora-canary-revision": "false",
			"quora-window-id": early.windowId || "",
			"quora-broadcast-id": settings.broadcastId || ""
		};
		if (token) headers["quora-turnstile-token"] = token;
		const result = await fetch("/graphql/gql_para_POST?q=SearchResultsListQuery", {
			method: "POST",
			credentials: "include",
			headers,
			body: JSON.stringify({ queryName: "SearchResultsListQuery", variables: payload.variables, extensions: { hash: payload.hash } })
		});
		return { status: result.status, body: await result.text() };
	}, { variables, hash: SEARCH_HASH });
	if (response.status < 200 || response.status >= 300) throw new Error(`GraphQL HTTP ${response.status}`);
	let body;
	try { body = JSON.parse(response.body); } catch { throw new Error("invalid GraphQL JSON"); }
	if (Array.isArray(body.errors) && body.errors.length) throw new Error(body.errors.map(item => item.message || "GraphQL error").join("; "));
	const connection = body.data?.searchConnection;
	if (!connection || !Array.isArray(connection.edges)) throw new Error("GraphQL searchConnection schema missing");
	return { body, connection };
}

function domRecords(page, type, limit) {
	return page.evaluate(async ({ requestedType, max }) => {
		const root = document.querySelector("main") || document.body;
		const lines = node => (node?.innerText || node?.textContent || "").split(/\r?\n+/).map(value => value.trim()).filter(Boolean);
		const absolute = value => { try { return value ? new URL(value, location.origin).toString() : null; } catch { return null; } };
		const records = [];
		const seen = new Set();
		const add = (key, record) => { if (!key || seen.has(key) || records.length >= max) return; seen.add(key); records.push(record); };
		const links = card => [...card.querySelectorAll("a[href]")];
		const author = card => {
			const link = links(card).find(item => new URL(item.href, location.origin).pathname.startsWith("/profile/"));
			return link ? { id: null, uid: null, name: (link.innerText || "").trim() || null, profileUrl: absolute(link.getAttribute("href")), profileImageUrl: link.querySelector("img")?.currentSrc || link.querySelector("img")?.src || null, followerCount: null, native: null } : null;
		};
		const metricText = card => card.querySelector(".puppeteer_test_votable_upvote_button")?.innerText?.trim() || null;
		const titleOf = card => card.querySelector(".puppeteer_test_question_title")?.innerText?.trim() || null;
		const cardForTitle = node => {
			let current = node;
			for (let i = 0; current && i < 14; i += 1, current = current.parentElement) {
				const text = current.innerText || "";
				if (current.querySelector?.(".puppeteer_test_votable_upvote_button") && /Upvote/i.test(text)) return current;
			}
			return node.parentElement?.parentElement?.parentElement || node;
		};
		const collectQuestion = () => {
			for (const card of root.querySelectorAll(".puppeteer_test_question_component_base")) {
				const title = card.querySelector("a[href]")?.innerText?.trim() || null;
				const href = [...card.querySelectorAll("a[href]")].find(a => !/answers?/i.test(a.innerText || ""))?.getAttribute("href") || null;
				if (!title || !href) continue;
				add(`question:${href}`, { kind: "question", rendererType: "dom", native: null, id: null, objectId: null, questionId: null, title, name: null, url: absolute(href), content: null, excerpt: null, author: null, question: null, publishedAt: null, metrics: { followers: null, answers: card.innerText.match(/[\d,.]+\s+answers?/i)?.[0] || null, upvotes: metricText(card), shares: null, comments: null, views: null }, text: lines(card).join("\n") });
				if (records.length >= max) break;
			}
		};
		const collectAnswerOrPost = resultType => {
			for (const titleNode of root.querySelectorAll(".puppeteer_test_question_title")) {
				const card = cardForTitle(titleNode);
				const title = titleOf(card);
				if (!title) continue;
				const cardLinks = links(card);
				const link = resultType === "answer"
					? cardLinks.find(a => a.href.includes("/answer/")) || cardLinks.find(a => a.href.includes("?topAns="))
					: cardLinks.find(a => !a.href.includes("/profile/") && !a.href.includes("/search") && !a.href.includes("/topic/"));
				const content = card.querySelector(".puppeteer_test_answer_content")?.innerText?.trim() || null;
				const timestamp = card.querySelector(".answer_timestamp, .post_timestamp")?.innerText?.trim() || null;
				const key = `${resultType}:${link?.href || title}`;
				add(key, { kind: resultType, rendererType: "dom", native: null, id: null, objectId: null, answerId: null, postId: null, title, name: null, url: absolute(link?.getAttribute("href")), content, excerpt: content, author: author(card), question: null, publishedAt: timestamp, metrics: { followers: null, answers: null, upvotes: metricText(card), shares: card.querySelector(".puppeteer_test_answer_quora_share_button")?.innerText?.trim() || null, comments: null, views: null }, text: lines(card).join("\n") });
				if (records.length >= max) break;
			}
		};
		const collectProfiles = () => {
			for (const link of [...root.querySelectorAll('a[href*="/profile/"]')]) {
				const href = link.getAttribute("href");
				if (!href || href === "/profile/") continue;
				let card = link;
				for (let i = 0; card && i < 8 && !/Follow/i.test(card.innerText || ""); i += 1) card = card.parentElement;
				const cardLines = lines(card || link);
				add(`profile:${href}`, { kind: "profile", rendererType: "dom", native: null, id: null, userId: null, name: (link.innerText || cardLines[0] || "").trim() || null, title: (link.innerText || cardLines[0] || "").trim() || null, url: absolute(href), content: cardLines.slice(1).join(" ") || null, author: null, publishedAt: null, metrics: { followers: cardLines.find(line => /^·?\s*[\d,.]+$/.test(line)) || null, answers: null, upvotes: null, shares: null, comments: null, views: null }, image: link.querySelector("img")?.currentSrc || link.querySelector("img")?.src || null, text: cardLines.join("\n") });
				if (records.length >= max) break;
			}
		};
		const collectTopics = () => {
			for (const link of [...root.querySelectorAll('a[href*="/topic/"]')]) {
				const href = link.getAttribute("href");
				const cardLines = lines(link);
				const name = cardLines[0] || link.innerText?.trim() || null;
				if (!href || !name) continue;
				add(`topic:${href}`, { kind: "topic", rendererType: "dom", native: null, id: null, topicId: null, name, title: name, url: absolute(href), content: null, author: null, publishedAt: null, metrics: { followers: cardLines.find(line => /^·?\s*[\d,.]+$/.test(line)) || null, answers: null, upvotes: null, shares: null, comments: null, views: null }, image: link.querySelector("img")?.currentSrc || link.querySelector("img")?.src || null, text: cardLines.join("\n") });
				if (records.length >= max) break;
			}
		};
		const collectTribes = () => {
			for (const link of [...root.querySelectorAll("a[href]")]) {
				let url;
				try { url = new URL(link.href); } catch { continue; }
				if (!url.hostname.endsWith(".quora.com") || url.hostname === "www.quora.com" || !/Space/i.test(link.innerText || "")) continue;
				const cardLines = lines(link);
				const name = cardLines[0] || null;
				add(`tribe:${link.href}`, { kind: "tribe", rendererType: "dom", native: null, id: null, tribeId: null, name, title: name, url: link.href, content: cardLines.slice(2).join(" ") || null, author: null, publishedAt: null, metrics: { followers: cardLines.find(line => /^·?\s*[\d,.]+$/.test(line)) || null, answers: null, upvotes: null, shares: null, comments: null, views: null }, image: link.querySelector("img")?.currentSrc || link.querySelector("img")?.src || null, text: cardLines.join("\n") });
				if (records.length >= max) break;
			}
		};
		const collect = resultType => {
			if (resultType === "all" || resultType === "question") collectQuestion();
			if (resultType === "all" || resultType === "answer") collectAnswerOrPost("answer");
			if (resultType === "all" || resultType === "post") collectAnswerOrPost("post");
			if (resultType === "all" || resultType === "profile") collectProfiles();
			if (resultType === "all" || resultType === "topic") collectTopics();
			if (resultType === "all" || resultType === "tribe") collectTribes();
		};
		for (let pass = 0; pass < 8 && records.length < max; pass += 1) {
			collect(requestedType);
			if (records.length >= max) break;
			const before = document.body.scrollHeight;
			window.scrollBy(0, Math.max(400, Math.floor(window.innerHeight * 0.85)));
			await new Promise(resolve => setTimeout(resolve, 360 + Math.floor(Math.random() * 360)));
			const atEnd = window.scrollY + window.innerHeight >= document.body.scrollHeight - 8;
			if (atEnd && document.body.scrollHeight === before) break;
		}
		const bodyText = (document.body?.innerText || "").toLowerCase();
		const blocked = /verify you are human|checking your browser|enable javascript|cf-chl-|turnstile challenge/.test(bodyText);
		const validEmpty = !blocked && /no results|no matching|didn.t find|did not match/.test(bodyText);
		return { records: records.slice(0, max), validEmpty, blocked };
	}, { requestedType: type, max: limit });
}

function selectorFor(type) {
	if (type === "question") return ".puppeteer_test_question_component_base";
	if (type === "answer" || type === "post") return ".puppeteer_test_question_title";
	if (type === "profile") return 'a[href*="/profile/"]';
	if (type === "topic") return 'a[href*="/topic/"]';
	if (type === "tribe") return 'a[href]';
	return ".puppeteer_test_question_component_base, .puppeteer_test_question_title, a[href*=\"/profile/\"], a[href*=\"/topic/\"]";
}

export default async (page, params, cwd) => {
	const query = typeof params.query === "string" ? params.query.trim() : "";
	if (!query) fail("MISSING_PARAM", "query is required");
	const type = params.type;
	if (!TYPES.has(type)) fail("INVALID_PARAM", `type must be one of ${[...TYPES].join(", ")}`);
	const rawLimit = params.limit === undefined || params.limit === null ? "" : String(params.limit).trim();
	if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit) < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(rawLimit);
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
	const sort = params.sort;
	if (!SORTS.has(sort)) fail("INVALID_PARAM", `sort must be one of ${[...SORTS].join(", ")}`);
	const time = params.time;
	if (!TIMES.has(time)) fail("INVALID_PARAM", `time must be one of ${[...TIMES].join(", ")}`);
	const ignoredParams = sort === "popular" ? ["sort=popular"] : [];
	const url = searchUrl(query, type, sort, time);
	let apiFailure = null;
	try {
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
		await page.waitForTimeout(randomBetween(450, 800));
		await lightHumanize(page);
		const records = [];
		const seen = new Set();
		const pages = [];
		let after = null;
		for (let pageNumber = 0; pageNumber < PAGE_CAP && records.length < limit; pageNumber += 1) {
			if (pageNumber > 0) await page.waitForTimeout(randomBetween(260, 520));
			const first = Math.min(PAGE_SIZE, limit - records.length);
			const response = await readGraphql(page, apiVariables(query, type, sort, time, first, after));
			const connection = response.connection;
			pages.push(response.body);
			for (const edge of connection.edges) {
				if (!edge?.node) continue;
				const key = resultKey(edge.node, type);
				if (seen.has(key)) continue;
				seen.add(key);
				records.push(normalizeNode(edge.node, type));
				if (records.length >= limit) break;
			}
			const next = connection.pageInfo?.endCursor;
			if (!connection.pageInfo?.hasNextPage || next === null || next === undefined || String(next) === String(after)) break;
			after = next;
		}
		if (records.length > 0 || pages.length > 0) {
			await page.waitForTimeout(randomBetween(0, 450));
			const output = { query, type, sort, time, maxLimit: MAX_LIMIT, results: records.slice(0, limit), resultCount: Math.min(records.length, limit), pagesFetched: pages.length, source: "api", fallbackUsed: false, nativeEnvelope: { pages } };
			if (ignoredParams.length) output.ignoredParams = ignoredParams;
			return output;
		}
		throw new Error("GraphQL returned no pages");
	} catch (error) {
		apiFailure = error instanceof Error ? error.message : String(error);
	}

	try {
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
		await page.waitForSelector(selectorFor(type), { timeout: 10000 }).catch(() => {});
		await page.waitForTimeout(randomBetween(420, 820));
		await lightHumanize(page, true);
		const dom = await domRecords(page, type, limit);
		if (dom.blocked) fail("DRIFT_DETECTED", `Quora page is blocked by Cloudflare/Turnstile: ${apiFailure || "challenge"}`);
		if (!dom.records.length && !dom.validEmpty) fail("DRIFT_DETECTED", `Quora GraphQL and DOM extraction failed: ${apiFailure || "no visible results"}`);
		await page.waitForTimeout(randomBetween(0, 450));
		const output = { query, type, sort, time, maxLimit: MAX_LIMIT, results: dom.records, resultCount: dom.records.length, pagesFetched: 1, source: "dom", fallbackUsed: true, partial: true, fallbackReason: apiFailure || "GraphQL unavailable" };
		if (ignoredParams.length) output.ignoredParams = ignoredParams;
		return output;
	} catch (error) {
		if (error?.code === "DRIFT_DETECTED") throw error;
		fail("DRIFT_DETECTED", `Quora GraphQL and DOM extraction failed: ${apiFailure || error.message || "unknown error"}`);
	}
};
