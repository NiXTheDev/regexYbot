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
export function analyzePatternForTips(
	pattern: string,
	replacement?: string,
): OptimizationTip[] {
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
		let skipTip = false;
		if (replacement) {
			const refs = replacement.match(/\$(\d+)/g);
			if (refs) {
				const referencedGroups = new Set(
					refs.map((r) => parseInt(r.slice(1), 10)),
				);
				let allReferenced = true;
				for (let i = 1; i <= capturingGroups.length; i++) {
					if (!referencedGroups.has(i)) {
						allReferenced = false;
						break;
					}
				}
				skipTip = allReferenced;
			}
		}
		if (!skipTip) {
			tips.push({
				pattern: "multiple ( ) groups",
				suggestion: "(?: ) for non-capturing",
				reason: "faster if you don't need backreferences",
				severity: "moderate",
			});
		}
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
		const allowlistRegex = /\\[nrtdwDsWbBfvS]/;
		const seen = new Set<string>();
		for (const escape of unnecessaryEscapes) {
			if (allowlistRegex.test(escape)) continue;
			if (seen.has(escape)) continue;
			seen.add(escape);

			// Skip \S inside [\s\S] (safeguard; \S is already in the allowlist)
			if (escape === "\\S") continue;

			const char = escape[1];
			let reason: string;
			switch (escape) {
				case "\\e":
					reason = 'matches literal "e"';
					break;
				default:
					reason = `matches literal "${char}"`;
					break;
			}

			tips.push({
				pattern: escape,
				suggestion: "remove unnecessary escaping",
				reason: `In JavaScript regex, ${escape} ${reason}`,
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
	return `> ${tip.pattern}\n- ${tip.suggestion} (${tip.reason})`;
}

/**
 * Get the most significant tip for a pattern
 * Returns null if no significant tips found or if user recently saw this tip
 */
export function getBestTip(
	pattern: string,
	userId: number,
	replacement?: string,
): OptimizationTip | null {
	const tips = analyzePatternForTips(pattern, replacement);

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
 * Send an ephemeral optimization tip
 * Uses receiver_user_id for privacy — only the sender sees it
 */
export async function sendTransientTip(
	ctx: {
		api: {
			sendMessage: (
				chatId: number,
				text: string,
				options?: { receiver_user_id?: number },
			) => Promise<{ message_id: number }>;
		};
		chat?: { id: number };
		from?: { id: number };
	},
	tip: OptimizationTip,
): Promise<void> {
	const formattedTip = formatTip(tip);

	try {
		if (ctx.chat?.id && ctx.from?.id) {
			await ctx.api.sendMessage(ctx.chat.id, formattedTip, {
				receiver_user_id: ctx.from.id,
			});
		}
	} catch (error) {
		_logger.error(`Failed to send tip: ${error}`);
	}
}
