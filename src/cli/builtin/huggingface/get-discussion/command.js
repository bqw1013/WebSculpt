// huggingface/get-discussion — fetch a single repo discussion (model/dataset/Space).
// Browser runtime: reuse the user's Chrome network, in-page fetch /api/{type}/{repo}/discussions/{num} for JSON.

function randInt(min, max) {
	return min + Math.floor(Math.random() * (max - min + 1));
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize a repo input (org/name, or a full discussion/repo URL) down to org/name.
function normalizeRepo(raw) {
	let s = String(raw === undefined || raw === null ? '' : raw).trim();
	if (!s) return '';
	s = s.replace(/^https?:\/\/huggingface\.co\//i, '');
	s = s.replace(/^huggingface\.co\//i, '');
	s = s.replace(/^(models|datasets|spaces)\//i, '');
	// strip a trailing /discussions/... path if a full discussion URL was passed
	s = s.split('/discussions/')[0];
	return s.trim();
}

export default async (page, params, cwd) => {
	// --- parameter validation (before any network call) ---
	const repoRaw = params.repo === undefined || params.repo === null ? '' : String(params.repo);
	const repo = normalizeRepo(repoRaw);
	if (!repo || !repo.includes('/')) {
		const err = new Error('[INVALID_PARAM] repo must be a Hugging Face repo id as org/name (e.g. deepseek-ai/DeepSeek-R1) or a full URL, got: ' + repoRaw);
		err.code = 'INVALID_PARAM';
		throw err;
	}

	const numStr = String(params.number === undefined || params.number === null ? '' : params.number).trim();
	if (!/^\d+$/.test(numStr)) {
		const err = new Error('[INVALID_PARAM] number must be a positive integer discussion number (e.g. 255), got: ' + params.number);
		err.code = 'INVALID_PARAM';
		throw err;
	}
	const number = parseInt(numStr, 10);
	if (number < 1) {
		const err = new Error('[INVALID_PARAM] number must be a positive integer discussion number (e.g. 255), got: ' + params.number);
		err.code = 'INVALID_PARAM';
		throw err;
	}

	// --- navigate once to establish huggingface.co origin, then fetch the API in-page ---
	try {
		await page.goto('https://huggingface.co/', { waitUntil: 'domcontentloaded', timeout: 30000 });
	} catch (e) {
		const err = new Error('[NETWORK_ERROR] Failed to reach huggingface.co from the browser: ' + e.message);
		err.code = 'NETWORK_ERROR';
		throw err;
	}

	// polite pacing: short random mouse movement, scroll, and wait (kept light, not noticeably slow)
	try {
		await page.mouse.move(randInt(60, 320), randInt(120, 600));
		await page.mouse.move(randInt(340, 780), randInt(180, 540));
		await page.evaluate(() => {
			window.scrollBy(0, Math.floor(Math.random() * 320));
		});
	} catch (_) { /* non-fatal */ }
	await sleep(randInt(350, 900));

	// --- resolve repo type (models → datasets → spaces) and fetch the discussion detail ---
	const types = ['models', 'datasets', 'spaces'];
	let detail;
	try {
		detail = await page.evaluate(async ({ repo, number, types }) => {
			const fetchOne = async (t) => {
				const res = await fetch('/api/' + t + '/' + repo + '/discussions/' + number, {
					headers: { accept: 'application/json' }
				});
				let body = null;
				try { body = await res.json(); } catch (_) { body = null; }
				return { status: res.status, body };
			};
			for (const t of types) {
				const r = await fetchOne(t);
				if (r.status === 200) {
					return { ok: true, type: t.slice(0, -1), data: r.body };
				}
				const msg = r.body && r.body.error ? r.body.error : ('HTTP ' + r.status);
				if (msg.indexOf('No discussion found matching num') !== -1) {
					return { ok: false, error: msg };
				}
				// "Repository not found" (wrong type / missing repo) or other status → try next type
			}
			return { ok: false, error: 'Repository not found' };
		}, { repo, number, types });
	} catch (e) {
		const err = new Error('[NETWORK_ERROR] In-page fetch to HF discussion API failed: ' + e.message);
		err.code = 'NETWORK_ERROR';
		throw err;
	}

	if (!detail.ok) {
		const err = new Error('[NOT_FOUND] ' + detail.error);
		err.code = 'NOT_FOUND';
		throw err;
	}

	const j = detail.data;
	const type = detail.type;

	// --- build the canonical discussion URL from the resolved repo type ---
	const base = type === 'model'
		? 'https://huggingface.co/' + repo
		: 'https://huggingface.co/' + type + 's/' + repo;
	const url = base + '/discussions/' + number;

	// --- body = first comment event; comments = subsequent comment events (skip commit/title-change/...) ---
	const commentEvents = (j.events || []).filter((e) => e.type === 'comment');
	const body = commentEvents.length > 0 && commentEvents[0].data && commentEvents[0].data.latest
		? (commentEvents[0].data.latest.raw || '')
		: '';
	const comments = commentEvents.slice(1).map((e) => ({
		author: e.author && e.author.name ? e.author.name : null,
		at: e.createdAt ? e.createdAt : null,
		body: e.data && e.data.latest ? (e.data.latest.raw || '') : '',
		hidden: !!(e.data && e.data.hidden)
	}));

	// --- files_changed: only for pull-request discussions; parse diffUrl into per-file summary ---
	let filesChanged = null;
	if (j.isPullRequest && j.diffUrl) {
		let diffText = null;
		try {
			const diffRes = await page.evaluate(async (diffUrl) => {
				const res = await fetch(diffUrl);
				if (!res.ok) return { error: 'HTTP ' + res.status };
				return { text: await res.text() };
			}, j.diffUrl);
			if (diffRes && diffRes.text !== undefined) diffText = diffRes.text;
		} catch (_) { /* diff fetch is best-effort; files stays empty on failure */ }

		const files = [];
		if (diffText !== null) {
			let cur = null;
			for (const line of diffText.split('\n')) {
				if (line.indexOf('diff --git ') === 0) {
					if (cur) files.push(cur);
					const m = line.match(/diff --git a\/(.*?) b\/(.*)$/);
					cur = { file: m ? m[2] : line.slice(12), additions: 0, deletions: 0 };
				} else if (line.charAt(0) === '+' && line.charAt(1) !== '+') {
					if (cur) cur.additions += 1;
				} else if (line.charAt(0) === '-' && line.charAt(1) !== '-') {
					if (cur) cur.deletions += 1;
				}
			}
			if (cur) files.push(cur);
		}
		filesChanged = { diff_url: j.diffUrl, files };
	}

	return {
		repo,
		type,
		number,
		title: j.title || null,
		url,
		status: j.status || null,
		is_pull_request: !!j.isPullRequest,
		author: j.author && j.author.name ? j.author.name : null,
		author_fullname: j.author && j.author.fullname ? j.author.fullname : null,
		opened_at: j.createdAt || null,
		body,
		files_changed: filesChanged,
		comments
	};
};
