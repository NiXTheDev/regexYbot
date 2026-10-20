import { describe, test, expect } from "bun:test";
import {
	analyzePatternForTips,
	formatTip,
	getBestTip,
	hasSignificantImprovement,
	sendTransientTip,
} from "../optimizationTips";
import type { OptimizationTip } from "../optimizationTips";

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

describe("sendTransientTip", () => {
	const tip = {
		pattern: "\\e",
		suggestion: "remove unnecessary escaping",
		reason: "matches literal e",
		severity: "minor" as const,
	};

	function createMockCtx(chatType: string) {
		let capturedOptions: { receiver_user_id?: number } | undefined;
		const deleted: number[] = [];
		const sendMessage = async (
			_chatId: number,
			_text: string,
			options?: { receiver_user_id?: number },
		) => {
			capturedOptions = options;
			return { message_id: 1 };
		};
		const deleteMessage = async (_chatId: number, messageId: number) => {
			deleted.push(messageId);
		};
		return {
			ctx: {
				api: { sendMessage, deleteMessage },
				chat: { id: 123, type: chatType },
				from: { id: 456 },
			},
			getOptions: () => capturedOptions,
			getDeleted: () => deleted,
		};
	}

	test("passes receiver_user_id in group chat", async () => {
		const { ctx, getOptions } = createMockCtx("group");
		await sendTransientTip(ctx, tip);
		expect(getOptions()?.receiver_user_id).toBe(456);
	});

	test("passes receiver_user_id in supergroup chat", async () => {
		const { ctx, getOptions } = createMockCtx("supergroup");
		await sendTransientTip(ctx, tip);
		expect(getOptions()?.receiver_user_id).toBe(456);
	});

	test("omits receiver_user_id in private chat", async () => {
		const { ctx, getOptions } = createMockCtx("private");
		await sendTransientTip(ctx, tip);
		expect(getOptions()).toBeDefined();
		expect("receiver_user_id" in (getOptions() ?? {})).toBe(false);
	});

	test("deletes the tip once the lifetime elapses", async () => {
		const { ctx, getDeleted } = createMockCtx("group");
		await sendTransientTip(ctx, tip, 5);
		expect(getDeleted()).toEqual([]);
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(getDeleted()).toEqual([1]);
	});

	test("keeps the tip while the lifetime has not elapsed", async () => {
		const { ctx, getDeleted } = createMockCtx("private");
		await sendTransientTip(ctx, tip, 100);
		await new Promise((resolve) => setTimeout(resolve, 15));
		expect(getDeleted()).toEqual([]);
	});
});

describe("tip significance gating", () => {
	const minorTip: OptimizationTip = {
		pattern: "\\e",
		suggestion: "remove unnecessary escaping",
		reason: "matches literal e",
		severity: "minor",
	};
	const moderateTip: OptimizationTip = {
		pattern: ".*",
		suggestion: ".*?",
		reason: "lazy quantifier can be faster for large texts",
		severity: "moderate",
	};

	test("minor-only tip sets are not significant", () => {
		expect(hasSignificantImprovement([minorTip])).toBe(false);
	});

	test("moderate and significant tips count as significant", () => {
		expect(hasSignificantImprovement([moderateTip])).toBe(true);
		expect(hasSignificantImprovement([minorTip, moderateTip])).toBe(true);
	});

	test("empty tip sets are not significant", () => {
		expect(hasSignificantImprovement([])).toBe(false);
	});

	test("significantOnly gates minor-only patterns out of getBestTip", () => {
		const minorOnlyPattern = "\\e";

		// Default behavior keeps cosmetic tips.
		expect(getBestTip(minorOnlyPattern, 91_101)).not.toBeNull();

		// Gated mode suppresses them entirely.
		expect(
			getBestTip(minorOnlyPattern, 91_102, undefined, {
				significantOnly: true,
			}),
		).toBeNull();
	});

	test("significantOnly keeps patterns with moderate tips", () => {
		const tip = getBestTip("abcdefgh.*x", 91_103, undefined, {
			significantOnly: true,
		});
		expect(tip).not.toBeNull();
	});
});
