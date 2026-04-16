import { describe, expect, it, vi } from "vitest";
import { handleConfigInit } from "../../../../src/cli/meta/config.js";

vi.mock("../../../../src/infra/store.js", () => ({
	initStore: vi.fn().mockResolvedValue(undefined),
}));

describe("handleConfigInit", () => {
	it("returns a success result with a confirmation message", async () => {
		const result = await handleConfigInit();
		expect(result).toEqual({
			success: true,
			message: "WebSculpt initialized.",
		});
	});
});
