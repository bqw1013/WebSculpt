// twitch/get-clip: fetch the full detail of a single Twitch clip by URL or bare slug.
// Single source of truth: POST https://gql.twitch.tv/gql with the ShareClipRenderStatus
// persisted query and the public web Client-ID. One request per invocation (plus retry
// backoff on transient failure), which keeps the request rate well below observed limits.

const GQL_ENDPOINT = "https://gql.twitch.tv/gql";
const CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const SHARE_CLIP_RENDER_STATUS_HASH = "552c19362ba6033f564e5e25ba9c6e4f5b34cd3a734ba69e5ed61c7ab0d439b9";
const MAX_ATTEMPTS = 3;

function makeError(code, message) {
	const err = new Error(`[${code}] ${message}`);
	err.code = code;
	return err;
}

// Accept a full clip URL (https://www.twitch.tv/{channel}/clip/{slug}[?range=...]) or a
// bare slug. The slug is the true identifier; the channel segment and query string are
// irrelevant and stripped here. Also tolerates clips.twitch.tv/{slug} embed URLs.
function extractSlug(raw) {
	let s = String(raw || "").trim();
	if (!s) return "";
	s = s.split("?")[0].split("#")[0];
	if (/^https?:\/\//i.test(s)) {
		const segments = s.split("/").filter(Boolean);
		s = segments[segments.length - 1] || "";
	}
	return s.replace(/\/+$/, "").trim();
}

function buildPayload(slug) {
	return [
		{
			operationName: "ShareClipRenderStatus",
			variables: { slug },
			extensions: {
				persistedQuery: { version: 1, sha256Hash: SHARE_CLIP_RENDER_STATUS_HASH },
			},
		},
	];
}

export default async function (params) {
	const raw = params.url === undefined || params.url === null ? "" : String(params.url).trim();
	if (!raw) {
		throw makeError("MISSING_PARAM", "url is required");
	}
	const slug = extractSlug(raw);
	if (!slug) {
		throw makeError("INVALID_URL", "url must be a Twitch clip URL or a clip slug");
	}

	const payload = buildPayload(slug);

	let gqlResult = null;
	let lastError = null;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const res = await fetch(GQL_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json", "Client-ID": CLIENT_ID },
				body: JSON.stringify(payload),
			});
			const text = await res.text();
			gqlResult = { status: res.status, text };
		} catch (error) {
			gqlResult = null;
			lastError = `Twitch GraphQL request failed: ${error?.message || error}`;
		}

		if (gqlResult && gqlResult.status === 200) {
			break;
		}
		if (gqlResult) {
			lastError = `Twitch GraphQL returned HTTP ${gqlResult.status}`;
		}
		if (attempt < MAX_ATTEMPTS) {
			// Random sleep between retries (200-700ms) to stay well within Twitch's rate limits.
			await new Promise((resolve) => setTimeout(resolve, 200 + Math.floor(Math.random() * 500)));
		}
	}

	if (!gqlResult) {
		throw makeError("DRIFT_DETECTED", lastError || "Twitch GraphQL request failed");
	}
	if (gqlResult.status !== 200) {
		if (gqlResult.status === 429) {
			throw makeError("RATE_LIMITED", "Twitch GraphQL rate-limited the request");
		}
		throw makeError("DRIFT_DETECTED", lastError || `Twitch GraphQL returned HTTP ${gqlResult.status}`);
	}

	let parsed;
	try {
		parsed = JSON.parse(gqlResult.text);
	} catch (e) {
		throw makeError("DRIFT_DETECTED", `Failed to parse GraphQL response: ${e.message}`);
	}
	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw makeError("DRIFT_DETECTED", "Unexpected GraphQL response structure");
	}

	const entry = parsed[0];
	if (entry.errors && entry.errors.length > 0) {
		throw makeError("DRIFT_DETECTED", entry.errors[0].message);
	}
	const clip = entry.data && entry.data.clip;
	if (!clip) {
		// Nonexistent/deleted slug returns HTTP 200 with data.clip === null.
		throw makeError("NOT_FOUND", `Clip not found: ${slug}`);
	}

	const broadcaster = clip.broadcaster || {};
	const game = clip.game || null;
	const curator = clip.curator || null;
	const sourceVideo = clip.video || null;

	return {
		title: clip.title || null,
		url: clip.url || null,
		channel: {
			name: broadcaster.displayName || broadcaster.login || null,
			url: broadcaster.login ? `https://www.twitch.tv/${broadcaster.login}` : null,
		},
		category: game ? { name: game.displayName || game.name || null, slug: game.slug || null } : null,
		views: typeof clip.viewCount === "number" ? clip.viewCount : null,
		clipper: curator
			? {
					name: curator.displayName || curator.login || null,
					url: curator.login ? `https://www.twitch.tv/${curator.login}` : null,
				}
			: null,
		duration: typeof clip.durationSeconds === "number" ? clip.durationSeconds : null,
		createdAt: clip.createdAt || null,
		sourceVideoUrl: sourceVideo && sourceVideo.id ? `https://www.twitch.tv/videos/${sourceVideo.id}` : null,
		thumbnailUrl: clip.thumbnailURL || null,
	};
}
