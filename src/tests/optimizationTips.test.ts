import { describe, test, expect } from "bun:test";
import { analyzePatternForTips, formatTip } from "../optimizationTips";

describe("analyzePatternForTips", () => {
	test("does not flag \\S as unnecessary", () => {
		const tips = analyzePatternForTips("^\\S+\\s\\e");
		expect(tips.some((t) => t.pattern === "\\S")).toBe(false);
	});

	test("flags \\e as unnecessary", () => {
		const tips = analyzePatternForTips("\\e");
		expect(tips.some((t) => t.pattern === "\\e")).toBe(true);
	});

	test("does not flag \\f or \\v as unnecessary", () => {
		const tipsF = analyzePatternForTips("\\f");
		const tipsV = analyzePatternForTips("\\v");
		expect(tipsF.some((t) => t.pattern === "\\f")).toBe(false);
		expect(tipsV.some((t) => t.pattern === "\\v")).toBe(false);
	});

	test("\\S alone produces no unnecessary-escape tip", () => {
		const tips = analyzePatternForTips("\\S+");
		expect(
			tips.some((t) => t.suggestion === "remove unnecessary escaping"),
		).toBe(false);
	});

	test("creates per-escape tips for multiple unnecessary escapes", () => {
		const tips = analyzePatternForTips("\\e\\x");
		const unnecessaryTips = tips.filter(
			(t) => t.suggestion === "remove unnecessary escaping",
		);
		expect(unnecessaryTips.length).toBe(2);
		expect(unnecessaryTips.some((t) => t.pattern === "\\e")).toBe(true);
		expect(unnecessaryTips.some((t) => t.pattern === "\\x")).toBe(true);
	});

	test("suggests \\d for [0-9]", () => {
		const tips = analyzePatternForTips("[0-9]");
		expect(
			tips.some((t) => t.pattern === "[0-9]" && t.suggestion === "\\d"),
		).toBe(true);
	});

	test("suggests \\w for [a-zA-Z0-9_]", () => {
		const tips = analyzePatternForTips("[a-zA-Z0-9_]");
		expect(
			tips.some((t) => t.pattern === "[a-zA-Z0-9_]" && t.suggestion === "\\w"),
		).toBe(true);
	});

	test("suggests \\s for [ \\t]", () => {
		const tips = analyzePatternForTips("[ \\t]");
		expect(
			tips.some((t) => t.pattern === "[ \\t]" && t.suggestion === "\\s"),
		).toBe(true);
	});

	test("formatTip returns correct format", () => {
		const tip = {
			pattern: "\\e",
			suggestion: "remove unnecessary escaping",
			reason: "matches literal e",
			severity: "minor" as const,
		};
		expect(formatTip(tip)).toBe(
			"> \\e\n- remove unnecessary escaping (matches literal e)",
		);
	});

	test("returns empty tips for empty pattern", () => {
		const tips = analyzePatternForTips("");
		expect(tips.length).toBe(0);
	});

	test("\\e\\S returns tip for \\e but not \\S", () => {
		const tips = analyzePatternForTips("\\e\\S");
		expect(tips.some((t) => t.pattern === "\\e")).toBe(true);
		expect(tips.some((t) => t.pattern === "\\S")).toBe(false);
	});

	test("skips grouping tip when all groups referenced in replacement", () => {
		const tips = analyzePatternForTips("(\\w+)\\s(\\w+)\\s(\\w+)", "$1 $2 $3");
		expect(tips.some((t) => t.pattern === "multiple ( ) groups")).toBe(false);
	});

	test("shows grouping tip when some groups unused", () => {
		const tips = analyzePatternForTips("(\\w+)\\s(\\w+)\\s(\\w+)", "$1 $3");
		expect(tips.some((t) => t.pattern === "multiple ( ) groups")).toBe(true);
	});

	test("shows grouping tip when no replacement provided", () => {
		const tips = analyzePatternForTips("(\\w+)\\s(\\w+)\\s(\\w+)");
		expect(tips.some((t) => t.pattern === "multiple ( ) groups")).toBe(true);
	});
});
