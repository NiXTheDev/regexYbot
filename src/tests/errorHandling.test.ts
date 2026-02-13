import { describe, test, expect } from "bun:test";
import { SED_PATTERN, getRegexFlags } from "../utils";

describe("Error Handling and Edge Cases", () => {
	describe("SED_PATTERN edge cases", () => {
		test("should not match empty string", () => {
			expect(SED_PATTERN.test("")).toBe(false);
		});

		test("should not match regular text", () => {
			expect(SED_PATTERN.test("hello world")).toBe(false);
			expect(SED_PATTERN.test("just some text")).toBe(false);
		});

		test("should not match incomplete sed command", () => {
			expect(SED_PATTERN.test("s/pattern")).toBe(false);
			expect(SED_PATTERN.test("s/")).toBe(false);
			expect(SED_PATTERN.test("s")).toBe(false);
		});

		test("should handle escaped delimiters", () => {
			expect(SED_PATTERN.test("s/foo\\/bar/baz/")).toBe(true);
			expect(SED_PATTERN.test("s/foo/bar\\/baz/")).toBe(true);
		});

		test("should handle multiple flags", () => {
			expect(SED_PATTERN.test("s/foo/bar/gi")).toBe(true);
			expect(SED_PATTERN.test("s/foo/bar/gimsuy")).toBe(true);
		});

		test("should handle empty replacement", () => {
			expect(SED_PATTERN.test("s/pattern//")).toBe(true);
		});
	});

	describe("getRegexFlags edge cases", () => {
		test("should handle empty string", () => {
			const result = getRegexFlags("");
			expect(result.flags).toBe("");
		});

		test("should handle duplicate flags", () => {
			const result = getRegexFlags("ggg");
			expect(result.flags).toBe("g");
		});

		test("should handle invalid flags gracefully", () => {
			const result = getRegexFlags("xqz");
			// Should filter out invalid flags (x, q, z are not valid)
			expect(result.flags).toBe("");
		});

		test("should handle mixed valid and invalid flags", () => {
			const result = getRegexFlags("gxi");
			expect(result.flags).toContain("g");
			expect(result.flags).toContain("i");
			expect(result.flags).not.toContain("x");
		});

		test("should handle uppercase flags", () => {
			const result = getRegexFlags("GI");
			expect(result.flags).toContain("g");
			expect(result.flags).toContain("i");
		});

		test("should handle performance flag in input", () => {
			const result = getRegexFlags("gp");
			expect(result.flags).toContain("g");
			expect(result.originalFlags).toContain("p");
		});

		test("should normalize flags order", () => {
			const result1 = getRegexFlags("gim");
			const result2 = getRegexFlags("mig");
			// Both should have same flags
			expect(result1.flags.split("").sort()).toEqual(
				result2.flags.split("").sort(),
			);
		});
	});

	describe("Special characters in sed", () => {
		test("should handle special regex characters in pattern", () => {
			expect(SED_PATTERN.test("s/./dot/")).toBe(true);
			expect(SED_PATTERN.test("s/*/asterisk/")).toBe(true);
			expect(SED_PATTERN.test("s/+/plus/")).toBe(true);
			expect(SED_PATTERN.test("s/?/question/")).toBe(true);
			expect(SED_PATTERN.test("s/[/bracket/")).toBe(true);
			expect(SED_PATTERN.test("s/(/paren/")).toBe(true);
		});

		test("should handle newlines in replacement", () => {
			expect(SED_PATTERN.test("s/foo/bar\\n/")).toBe(true);
		});

		test("should handle tabs in replacement", () => {
			expect(SED_PATTERN.test("s/foo/bar\\t/")).toBe(true);
		});
	});

	describe("Boundary cases", () => {
		test("should handle very long pattern", () => {
			const longPattern = "s/" + "a".repeat(1000) + "/b/";
			expect(SED_PATTERN.test(longPattern)).toBe(true);
		});

		test("should handle unicode characters", () => {
			expect(SED_PATTERN.test("s/你好/世界/")).toBe(true);
			expect(SED_PATTERN.test("s/🎉/🎊/")).toBe(true);
		});

		test("should handle whitespace", () => {
			expect(SED_PATTERN.test("s/foo bar/baz qux/")).toBe(true);
			expect(SED_PATTERN.test("s/ foo / bar /")).toBe(true);
		});
	});
});
