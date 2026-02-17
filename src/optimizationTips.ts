/**
 * Optimization tips module for regexYbot
 *
 * Provides static analysis-based optimization suggestions
 * Tips auto-delete after 10 seconds to avoid clutter
 */

import { Logger } from "./logger";

const _logger = new Logger("OptimizationTips");

/**
 * Represents a detected optimization opportunity
 */
export interface OptimizationTip {
	pattern: string;
	suggestion: string;
	reason: string;
	severity: "minor" | "moderate" | "significant";
}

/**
 * Track recently shown tips per user (in-memory, no persistence)
 */
const recentTips = new Map<number, Map<string, number>>();

// Clean up old entries every 5 minutes
setInterval(
	() => {
		const cutoff = Date.now() - 5 * 60 * 1000;
		for (const [userId, tips] of recentTips) {
			for (const [tipKey, timestamp] of tips) {
				if (timestamp < cutoff) {
					tips.delete(tipKey);
				}
			}
			if (tips.size === 0) {
				recentTips.delete(userId);
			}
		}
	},
	5 * 60 * 1000,
);

/**
 * Analyze a regex pattern and return optimization tips
 */
export function analyzePatternForTips(pattern: string): OptimizationTip[] {
	const tips: OptimizationTip[] = [];

	// Check for digit character class
	if (/\[0-9\]/.test(pattern) && !pattern.includes("\\d")) {
		tips.push({
			pattern: "[0-9]",
			suggestion: "\\d",
			reason: "shorter and more readable",
			severity: "minor",
		});
	}

	// Check for word character class
	if (/\[a-zA-Z0-9_\]/.test(pattern) && !pattern.includes("\\w")) {
		tips.push({
			pattern: "[a-zA-Z0-9_]",
			suggestion: "\\w",
			reason: "shorter and more readable",
			severity: "minor",
		});
	}

	// Check for whitespace character class
	if (/\[ \\t\]/.test(pattern) && !pattern.includes("\\s")) {
		tips.push({
			pattern: "[ \\t]",
			suggestion: "\\s",
			reason: "includes all whitespace characters",
			severity: "moderate",
		});
	}

	// Check for capturing groups that might not be needed
	const capturingGroups = pattern.match(/\((?!\?)/g);
	if (capturingGroups && capturingGroups.length >= 3) {
		tips.push({
			pattern: "multiple ( ) groups",
			suggestion: "(?: ) for non-capturing",
			reason: "faster if you don't need backreferences",
			severity: "moderate",
		});
	}

	// Check for [\s\S] which can be replaced with . and s flag
	if (/\[\\s\\S\]/.test(pattern) && !pattern.includes("s")) {
		tips.push({
			pattern: "[\\s\\S]",
			suggestion: ". with s flag",
			reason: "more idiomatic and clear",
			severity: "minor",
		});
	}

	// Check for unnecessary escaping
	const unnecessaryEscapes = pattern.match(/\\[a-zA-Z0-9]/g);
	if (unnecessaryEscapes) {
		const hasUnnecessary = unnecessaryEscapes.some(
			(e) => !/\\[nrtdwDsWbB]/.test(e),
		);
		if (hasUnnecessary) {
			tips.push({
				pattern: "\\X escaping",
				suggestion: "remove unnecessary escapes",
				reason: "cleaner pattern",
				severity: "minor",
			});
		}
	}

	// Check for greedy quantifiers where lazy might be better
	// Simple heuristic: .* followed by specific pattern
	if (/\.\*[^?]/.test(pattern) && pattern.length > 10) {
		tips.push({
			pattern: ".*",
			suggestion: ".*?",
			reason: "lazy quantifier can be faster for large texts",
			severity: "moderate",
		});
	}

	// Check for anchored patterns without using ^ or $
	if (
		pattern.length > 5 &&
		!pattern.startsWith("^") &&
		!pattern.endsWith("$") &&
		pattern.includes(".*")
	) {
		tips.push({
			pattern: "unanchored pattern",
			suggestion: "add ^ and/or $ anchors",
			reason: "can improve performance",
			severity: "moderate",
		});
	}

	return tips;
}

/**
 * Format a tip message
 */
export function formatTip(tip: OptimizationTip): string {
	return `💡 Tip: ${tip.pattern} → ${tip.suggestion} (${tip.reason})`;
}

/**
 * Get the most significant tip for a pattern
 * Returns null if no significant tips found or if user recently saw this tip
 */
export function getBestTip(
	pattern: string,
	userId: number,
): OptimizationTip | null {
	const tips = analyzePatternForTips(pattern);

	if (tips.length === 0) {
		return null;
	}

	// Sort by severity
	const severityOrder = { significant: 3, moderate: 2, minor: 1 };
	tips.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

	// Get user's recent tips
	let userTips = recentTips.get(userId);
	if (!userTips) {
		userTips = new Map();
		recentTips.set(userId, userTips);
	}

	// Find the best tip they haven't seen recently
	for (const tip of tips) {
		const tipKey = `${tip.pattern}:${tip.suggestion}`;
		if (!userTips.has(tipKey)) {
			// Mark as shown
			userTips.set(tipKey, Date.now());
			return tip;
		}
	}

	return null;
}

/**
 * Check if pattern is significantly improvable
 * Returns true if there's at least one moderate or significant tip
 */
export function hasSignificantImprovement(pattern: string): boolean {
	const tips = analyzePatternForTips(pattern);
	return tips.some(
		(tip) => tip.severity === "moderate" || tip.severity === "significant",
	);
}

/**
 * Send a transient optimization tip
 * The message auto-deletes after 10 seconds
 */
export async function sendTransientTip(
	ctx: {
		reply: (text: string) => Promise<{ message_id: number }>;
		api: {
			deleteMessage: (chatId: number, messageId: number) => Promise<true>;
		};
		chat?: { id: number };
	},
	tip: OptimizationTip,
): Promise<void> {
	const formattedTip = formatTip(tip);

	try {
		const sentMessage = await ctx.reply(formattedTip);

		// Schedule deletion after 10 seconds
		setTimeout(async () => {
			try {
				if (ctx.chat?.id) {
					await ctx.api.deleteMessage(ctx.chat.id, sentMessage.message_id);
				}
			} catch {
				// Ignore deletion errors (message might already be deleted)
			}
		}, 10000);
	} catch (error) {
		_logger.error(`Failed to send tip: ${error}`);
	}
}
