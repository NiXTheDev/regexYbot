import { describe, test, expect } from "bun:test";
import {
	SED_PATTERN,
	getRegexFlags,
	escapeForMarkdownV2AndBackslashes,
} from "./utils";

describe("utils", () => {
	describe("SED_PATTERN", () => {
		test("should match simple sed command", () => {
			const match = "s/foo/bar/".match(SED_PATTERN);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("foo");
			expect(match![2]).toBe("bar");
			expect(match![3] || "").toBe("");
		});

		test("should match sed command with flags", () => {
			const match = "s/foo/bar/gi".match(SED_PATTERN);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("foo");
			expect(match![2]).toBe("bar");
			expect(match![3]).toBe("gi");
		});

		test("should match sed command with escaped slashes", () => {
			const match = "s/foo\\/bar/baz/".match(SED_PATTERN);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("foo\\/bar");
			expect(match![2]).toBe("baz");
		});

		test("should not match invalid sed command", () => {
			const match = "not-a-sed-command".match(SED_PATTERN);
			expect(match).toBeNull();
		});
	});

	describe("getRegexFlags", () => {
		test("should return empty flags for undefined input", () => {
			const result = getRegexFlags(undefined);
			expect(result.flags).toBe("");
			expect(result.originalFlags).toBeUndefined();
		});

		test("should parse standard flags", () => {
			const result = getRegexFlags("gi");
			expect(result.flags).toBe("gi");
			expect(result.originalFlags).toBe("gi");
		});

		test("should filter invalid flags", () => {
			const result = getRegexFlags("gixz");
			expect(result.flags).toBe("gi");
			expect(result.originalFlags).toBe("gixz");
		});

		test("should deduplicate and sort flags", () => {
			const result = getRegexFlags("iigg");
			expect(result.flags).toBe("gi");
		});
	});

	describe("escapeForMarkdownV2AndBackslashes", () => {
		test("should escape MarkdownV2 special characters", () => {
			const input = "Hello *world*";
			const result = escapeForMarkdownV2AndBackslashes(input);
			expect(result).toBe("Hello \\*world\\*");
		});

		test("should escape all MarkdownV2 special characters", () => {
			const input = "_*[]()~`>#+-=|{}.!";
			const result = escapeForMarkdownV2AndBackslashes(input);
			expect(result).toBe(
				"\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!",
			);
		});

		test("should escape backslashes", () => {
			const input = "path\\to\\file";
			const result = escapeForMarkdownV2AndBackslashes(input);
			expect(result).toBe("path\\\\to\\\\file");
		});

		test("should escape both backslashes and MarkdownV2 characters", () => {
			const input = "Hello\\*world\\*";
			const result = escapeForMarkdownV2AndBackslashes(input);
			expect(result).toBe("Hello\\\\\\*world\\\\\\*");
		});
	});
});
