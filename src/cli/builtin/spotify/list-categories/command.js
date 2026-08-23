// spotify/list-categories — extract the full podcast category tree from the
// "所有播客类别" page. No parameters.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 200 + Math.floor(Math.random() * 500);
const MAX_ATTEMPTS = 3;

// Some fresh daemon pages land on a OneTrust consent banner that blocks the SPA;
// dismiss it if present.
async function dismissConsent(page) {
	const selectors = ['#onetrust-accept-btn-handler', 'button:has-text("接受")', 'button:has-text("Accept")'];
	for (const sel of selectors) {
		const btn = await page.$(sel).catch(() => null);
		if (btn) {
			await btn.click({ timeout: 2000 }).catch(() => {});
			await sleep(500);
			return;
		}
	}
}

// Browser-context helper: walk the 8 category shelves and build the flat list.
// The first card of each shelf is the top-level category (parent null); the rest
// are children whose parent is the first card's name.
function collectTreeDom() {
	const clean = (node) => {
		if (!node) return '';
		const raw = node.textContent || node.innerText || node.getAttribute('aria-label') || '';
		return raw.trim().replace(/\s+/g, ' ');
	};
	const shelves = Array.from(document.querySelectorAll('[data-testid="component-shelf"]'));
	const categories = [];
	for (const shelf of shelves) {
		const links = Array.from(shelf.querySelectorAll('a[href*="/genre/"]'));
		if (links.length === 0) continue;
		const parentName = clean(links[0]);
		links.forEach((a, i) => {
			const href = (a.getAttribute('href') || '').trim();
			const genreId = href
				.replace(/^https?:\/\/[^/]+\/genre\//, '')
				.replace(/^\/genre\//, '')
				.replace(/[?#].*$/, '');
			if (!genreId) return;
			categories.push({
				name: clean(a),
				genreId,
				url: href.startsWith('http') ? href : 'https://open.spotify.com' + href,
				parent: i === 0 ? null : parentName,
			});
		});
	}
	return categories;
}

// Diagnostic helper for failure reporting.
function collectPageStateDom() {
	const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
	return {
		url: location.href,
		title: document.title,
		h1s: [...document.querySelectorAll('h1')].map((x) => norm(x.innerText)).filter(Boolean).slice(0, 5),
		shelfCount: document.querySelectorAll('[data-testid="component-shelf"]').length,
		sectionCount: document.querySelectorAll('section').length,
	};
}

export default async (page, params, cwd) => {
	const TARGET_URL = 'https://open.spotify.com/genre/0JQ5DArNBzkmxXHCqFLx2U';
	let categories = [];
	let lastState = null;

	// Navigate + extract; retry on Spotify's transient "Something went wrong"
	// error page / blank SPA render. MAX_ATTEMPTS with polite pacing.
	for (let attempt = 0; attempt < MAX_ATTEMPTS && categories.length === 0; attempt++) {
		await sleep(jitter());
		await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
		await dismissConsent(page);
		try {
			await page.waitForSelector('main', { timeout: 10000 });
		} catch (e) {
			// SPA may render without <main>; fall through and extract anyway.
		}
		// Settle delay so React finishes rendering the category tree into the DOM.
		await sleep(2000 + Math.random() * 500);
		categories = await page.evaluate(collectTreeDom);
		if (categories.length === 0) {
			lastState = await page.evaluate(collectPageStateDom);
			if (attempt < MAX_ATTEMPTS - 1) {
				const isErrorPage = /something went wrong/i.test(JSON.stringify(lastState.h1s || []));
				// Back off longer when Spotify returned its error page.
				await sleep(isErrorPage ? 2500 + Math.random() * 1000 : 1200 + Math.random() * 800);
			}
		}
	}

	if (categories.length === 0) {
		const err = new Error(
			'[DRIFT_DETECTED] Category shelves were not found on the page. Page state: ' +
				JSON.stringify(lastState)
		);
		err.code = 'DRIFT_DETECTED';
		throw err;
	}

	return { categories, count: categories.length };
};
