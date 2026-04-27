import { describe, test, expect } from "bun:test";
import { computeDiff } from "../diff";

describe("computeDiff", () => {
	describe("basic substitution", () => {
		test("should return diff for matching pattern", () => {
			const result = computeDiff("Hello foo", "s/foo/bar/");
			expect(result).toBe("~~foo~~ *bar*");
		});

		test("should return original text when no match", () => {
			const result = computeDiff("Hello foo", "s/nope/bar/");
			expect(result).toBe("Hello foo");
		});

		test("should handle global flag with multiple matches", () => {
			const result = computeDiff("foo foo", "s/o/X/g");
			// Function deduplicates matches, so repeated "o" appears once
			expect(result).toBe("~~o~~ *X*");
		});
	});
});
