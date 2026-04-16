import { describe, expect, it } from "vitest";
import { handleCommandShow } from "../../../../src/cli/meta/command.js";

describe("handleCommandShow", () => {
	it("returns a NOT_IMPLEMENTED error result", async () => {
		const result = await handleCommandShow("example", "hello");
		expect(result).toEqual({
			success: false,
			error: {
				code: "NOT_IMPLEMENTED",
				message: "Command details are not implemented yet.",
			},
		});
	});
});
