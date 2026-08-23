// kickstarter/list-categories — Kickstarter category taxonomy via the /graph rootCategories query.
//
// Runtime decision (explore-verified 2026-08-20): Node (https + fetch) is rejected by Cloudflare's
// TLS-fingerprint managed challenge on every Kickstarter host, so this command must run in the
// browser. Flow: navigate to the anonymous homepage (grants _ksr_session cookie + csrf-token meta),
// then run a same-origin in-page fetch to POST /graph. The endpoint and data were verified over
// HTTP with curl during explore: 15 top-level categories and 159 subcategories.
//
// Verified endpoint facts:
//   POST https://www.kickstarter.com/graph
//   Headers: Content-Type: application/json, X-CSRF-Token: <meta csrf-token>, Cookie: _ksr_session
//   (both token and cookie are required; Referer is optional).
//   Query:  rootCategories { id name slug subcategories { nodes { id name slug } } }
//   Shape:  { data: { rootCategories: [ { id, name, slug, subcategories: { nodes: [ {id,name,slug} ] } } ] } }

const ROOT_URL = 'https://www.kickstarter.com/';
const GRAPH_QUERY =
	'query rootCategories { rootCategories { id name slug subcategories { nodes { id name slug } } } }';
const NAV_TIMEOUT_MS = 30000;
const TOP_LEVEL_SLUGS = [
	'art', 'comics', 'crafts', 'dance', 'design', 'fashion', 'film & video',
	'food', 'games', 'journalism', 'music', 'photography', 'publishing', 'technology', 'theater'
];

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function randomBetween(min, max) {
	return Math.floor(min + Math.random() * (max - min + 1));
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isChallengeText(text) {
	const lower = (text || '').toLowerCase();
	return (
		/just a moment/.test(lower) ||
		/cf_chl_opt/.test(lower) ||
		/challenges\.cloudflare/.test(lower) ||
		/security verification/.test(lower) ||
		/正在进行安全验证/.test(lower)
	);
}

export default async (page, params, cwd) => {
	// 1. Load the anonymous homepage. domcontentloaded avoids waiting on third-party scripts.
	try {
		await page.goto(ROOT_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
	} catch (error) {
		fail('NETWORK_ERROR', `Failed to navigate to ${ROOT_URL}: ${error.message}`);
	}

	// 2. Read page state and extract the csrf-token meta (grants the anonymous session).
	const state = await page.evaluate(() => {
		const title = document.title || '';
		const body = document.body ? (document.body.innerText || '').slice(0, 4000) : '';
		const meta = document.querySelector('meta[name="csrf-token"]');
		return {
			url: location.href,
			title,
			body,
			token: meta ? meta.getAttribute('content') : null
		};
	});

	if (isChallengeText(`${state.title}\n${state.body}`)) {
		fail('PLATFORM_BLOCKED', 'Kickstarter served a Cloudflare challenge instead of the homepage');
	}
	if (!state.token) {
		fail('DRIFT_DETECTED', 'csrf-token meta not found on the Kickstarter homepage');
	}

	// 3. POST the rootCategories query from the page context (same-origin fetch carries _ksr_session).
	// A short random delay keeps the request cadence conservative.
	await sleep(randomBetween(200, 600));
	const result = await page.evaluate(async ({ token, query }) => {
		const resp = await fetch('/graph', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
			body: JSON.stringify({ operationName: 'rootCategories', variables: {}, query })
		});
		const text = await resp.text();
		let json = null;
		try {
			json = JSON.parse(text);
		} catch (error) {
			json = null;
		}
		return { httpStatus: resp.status, text, json };
	}, { token: state.token, query: GRAPH_QUERY });

	if (result.httpStatus === 429) {
		fail('RATE_LIMITED', 'Kickstarter rate-limited the /graph request (HTTP 429)');
	}
	if (isChallengeText(result.text) || (result.json && isChallengeText(JSON.stringify(result.json)))) {
		fail('PLATFORM_BLOCKED', `Kickstarter served a Cloudflare challenge on /graph (HTTP ${result.httpStatus})`);
	}
	if (!result.json) {
		fail('API_ERROR', `/graph returned a non-JSON response (HTTP ${result.httpStatus})`);
	}
	if (result.httpStatus !== 200 || !result.json.data || !Array.isArray(result.json.data.rootCategories)) {
		fail('DRIFT_DETECTED', `Unexpected /graph response (HTTP ${result.httpStatus}): ` + JSON.stringify(result.json).slice(0, 400));
	}

	// 4. Map the verified response to the contract shape.
	const categories = result.json.data.rootCategories.map((cat) => ({
		slug: cat.slug,
		name: cat.name,
		subcategories: (cat.subcategories && cat.subcategories.nodes ? cat.subcategories.nodes : []).map((sub) => ({
			slug: sub.slug,
			name: sub.name
		}))
	}));

	// 5. Apply the optional --parent filter (a client-side slice of the full tree).
	const rawParent = params.parent === undefined || params.parent === null ? '' : String(params.parent).trim();
	if (rawParent === '') {
		return { categories, total: categories.length };
	}
	if (!TOP_LEVEL_SLUGS.includes(rawParent)) {
		fail('INVALID_PARAM', `parent must be one of: ${TOP_LEVEL_SLUGS.join(', ')}, got '${rawParent}'`);
	}
	const filtered = categories.filter((cat) => cat.slug === rawParent);
	return { categories: filtered, total: filtered.length };
};
