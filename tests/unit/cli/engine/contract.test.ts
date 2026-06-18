import { describe, expect, it } from "vitest";
import { RESERVED_DOMAINS } from "../../../../src/cli/engine/contract.js";

describe("RESERVED_DOMAINS", () => {
	it("includes all meta-command domains", () => {
		expect(RESERVED_DOMAINS.has("command")).toBe(true);
		expect(RESERVED_DOMAINS.has("config")).toBe(true);
		expect(RESERVED_DOMAINS.has("skill")).toBe(true);
		expect(RESERVED_DOMAINS.has("daemon")).toBe(true);
		expect(RESERVED_DOMAINS.has("capture")).toBe(true);
	});

	it("includes scope and explore to align with CLI documentation", () => {
		expect(RESERVED_DOMAINS.has("scope")).toBe(true);
		expect(RESERVED_DOMAINS.has("explore")).toBe(true);
	});

	it("does not include common user domain names", () => {
		expect(RESERVED_DOMAINS.has("notes")).toBe(false);
		expect(RESERVED_DOMAINS.has("tasks")).toBe(false);
		expect(RESERVED_DOMAINS.has("browser")).toBe(false);
		expect(RESERVED_DOMAINS.has("github")).toBe(false);
	});
});
