# Evidence: producthunt/get-forum-thread

This document records the research and validation evidence for the `producthunt/get-forum-thread` command.

## Exploration Path

- Read the Product Hunt command design experience and the browser runtime contract before browser work.
- Checked the host command library and `get-forum-threads --help`; this is a new detail command complementary to the existing list command.
- Used the already attached user Chrome session. No browser was launched. An owned tab was created and verified before navigation.
- The first navigation attempt used an unsupported `--wait-until` option; plain `goto <url>` succeeded. This was a CLI syntax issue, not a CDP or Product Hunt failure.

## Verified URLs

- https://www.producthunt.com/p/general/what-are-the-5-tools-you-simply-couldn-t-do-your-work-without
- https://www.producthunt.com/p/general/what-are-the-5-tools-you-simply-couldn-t-do-your-work-without?page=2#comments
- https://www.producthunt.com/p/openai/openai-day-winners-are-in
- https://www.producthunt.com/p/openai/openai-day-winners-are-in?page=2#comments

## Structural Evidence

- Both a Topic Forum (`p/general`) and a Product Forum (`p/openai`) use the stable route `https://www.producthunt.com/p/{forumSlug}/{threadSlug}`.
- The General sample title was `What are the 5 tools you simply couldn't do your work without? : General Discussion Forums | Product Hunt`; its `h1` was the thread title, author was Nika, `time[datetime]` was `2026-06-09T00:00:00-07:00`, and the page showed `14K views`, numeric comment/upvote controls `772` and `755`.
- The OpenAI sample title was `OpenAI Day winners are in 🎉 : OpenAI Discussion Forums | Product Hunt`; its `h1` was `OpenAI Day winners are in 🎉`, author was Aaron O'Leary, `time[datetime]` was `2026-07-29T05:32:09-07:00`, and the page showed `489 views`, numeric comment/upvote controls `24` and `30`.
- Body content is exposed as paragraph/list text between the `h1` header and the `Replies` heading. Product associations use Product Hunt product links when present.
- Replies are headed `Replies`. Visible reply cards expose author controls, paragraph text, `time[datetime]`, optional product links, an Upvote control, Reply, Report, and Share. Nested replies can be visible inline and may expose `show more replies`.
- Reply pagination is a real query contract: `?page=2#comments`; General exposed pages 1-49 and OpenAI exposed pages 1-2. Page 2 retained the same thread metadata and returned a different reply page.
- No click or expansion was necessary for the first visible reply page. The command uses the stable page query instead of trying to expand nested replies. It returns a bounded reply list with `limit` and retains full page links only for `detailed=true`.

## Failure Signals

- `MISSING_PARAM`: required `forum` or `thread` is absent.
- `INVALID_PARAM`: a slug is empty/invalid, `page` is not a strict integer 1-50, `limit` is not a strict integer 1-50, or `detailed` is not `true`/`false`.
- `NOT_FOUND`: the page body contains a Product Hunt not-found marker and no thread title is available.
- `EMPTY_RESULT`: a valid thread page greater than 1 contains no replies.
- `DRIFT_DETECTED`: `main`, the thread `h1`, or the `Replies` marker is unavailable after the bounded wait.
- The browser runtime requires an existing Chrome/Edge instance; its infrastructure owns browser prerequisite errors. The command does not create or close the injected page.
- The implementation uses a short bounded random wait after navigation, one light mouse move, and a final 0-2 second wait. It does not click controls or expand reply trees.

## Capture Assessment

Capture is appropriate: the route and DOM markers were verified on two forum types and two comment pages, the output naturally complements `producthunt/get-forum-threads`, and the implementation can reuse the validated browser path without authentication or third-party dependencies. The assignment explicitly authorizes proceeding from this contract to capture, validation, finalization, installation, and real-command regression tests.
