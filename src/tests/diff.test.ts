import { describe, test, expect } from "bun:test";
import { computeDiff, generateDiffImage } from "../diff";

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

	describe("image format", () => {
		test("should return SVG string for matching pattern", () => {
			const result = computeDiff("Hello foo", "s/foo/bar/", "image");
			expect(result).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
			expect(result).toInclude("<svg");
			expect(result).toInclude("foo");
			expect(result).toInclude("bar");
		});

		test("should return SVG with message when no match", () => {
			const result = computeDiff("Hello foo", "s/nope/bar/", "image");
			expect(result).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
			expect(result).toInclude("No diff to display");
		});
	});
});

describe("generateDiffImage", () => {
	test("should return valid SVG with matches", () => {
		const result = generateDiffImage("Hello foo", "s/foo/bar/");
		expect(result).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
		expect(result).toInclude('<svg xmlns="http://www.w3.org/2000/svg"');
		expect(result).toInclude('font-family="Courier, monospace"');
		expect(result).toInclude("fill: #dc2626;");
		expect(result).toInclude("fill: #16a34a;");
		expect(result).toInclude("text-decoration: line-through");
		expect(result).toInclude("foo");
		expect(result).toInclude("bar");
	});

	test("should return SVG with no diff message when no matches", () => {
		const result = generateDiffImage("Hello foo", "s/nope/bar/");
		expect(result).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
		expect(result).toInclude("No diff to display");
	});

	test("should return SVG with no diff message for invalid command", () => {
		const result = generateDiffImage("Hello foo", "invalid");
		expect(result).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
		expect(result).toInclude("No diff to display");
	});

	test("should escape XML special characters", () => {
		const result = generateDiffImage("Hello <world>", "s/<world>/&test/");
		expect(result).toInclude("&lt;world&gt;");
		expect(result).toInclude("&amp;test");
	});

	test("should show multiple unique matches", () => {
		const result = generateDiffImage("foo bar baz", "s/[a-z]+/X/gi");
		// Should have 3 unique matches: foo, bar, baz
		const matchCount = (result.match(/text-decoration: line-through/g) || [])
			.length;
		expect(matchCount).toBe(3);
	});

	test("should use monospace font", () => {
		const result = generateDiffImage("test", "s/test/replacement/");
		expect(result).toInclude('font-family="Courier, monospace"');
	});

	test("should show arrow between match and replacement", () => {
		const result = generateDiffImage("test", "s/test/replacement/");
		expect(result).toInclude("→");
	});
});
