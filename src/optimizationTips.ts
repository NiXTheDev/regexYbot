/**
 * Optimization tips module for regexYbot
 *
 * Provides static analysis-based optimization suggestions
 * Tips auto-delete after 10 seconds to avoid clutter
 */

import { Logger } from "./logger";
import type { Translator } from "./i18n";

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
	options?: { significantOnly?: boolean },
): OptimizationTip | null {
	const tips = analyzePatternForTips(pattern, replacement);

	// When significantOnly is set, patterns whose only findings are
	// cosmetic (minor) tips produce no tip at all.
	if (options?.significantOnly && !hasSignificantImprovement(tips)) {
		return null;
	}

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
 * Check if analyzed tips include an improvement worth interrupting the
 * user for: moderate or significant. Minor tips are cosmetic and only
 * useful when cosmetic-tip suggestions are still worth surfacing.
 */
export function hasSignificantImprovement(
	tips: readonly OptimizationTip[],
): boolean {
	return tips.some(
		(tip) => tip.severity === "moderate" || tip.severity === "significant",
	);
}

/**
 * Tip kinds with a dedicated translation key, keyed by their `pattern`
 * marker; every other kind keeps the original formatted English block
 * (no behavior-changing rewording without a keyed variant).
 */
const KEYED_TIP_PATTERNS = new Set(["[0-9]", "[a-zA-Z0-9_]", "[ \\t]"]);

/**
 * Render a tip message through the given translator.
 *
 * @param tip - The tip to render
 * @param t - Translator bound to the requester's locale
 * @returns Localized tip text
 */
function renderTipMessage(tip: OptimizationTip, t: Translator): string {
	if (tip.pattern === ".*") {
		return t("tip-greedy");
	}
	if (tip.pattern === "multiple ( ) groups") {
		return t("tip-nonCapturing");
	}
	if (KEYED_TIP_PATTERNS.has(tip.pattern)) {
		// The per-kind keys phrase this as "use X instead of Y" where X is
		// the suggested shorthand and Y the spelled-out class.
		return t("tip-useShorthand", {
			shorthand: tip.suggestion,
			longform: tip.pattern,
		});
	}
	return formatTip(tip);
}

/**
 * How long an ephemeral tip stays visible before it deletes itself
 */
export const TIP_LIFETIME_MS = 10_000;

/**
 * Send an ephemeral optimization tip
 * Uses receiver_user_id for privacy — only the sender sees it — and
 * deletes the message after `lifetimeMs` to avoid clutter
 */
export async function sendTransientTip(
	ctx: {
		api: {
			sendMessage: (
				chatId: number,
				text: string,
				options?: { receiver_user_id?: number },
			) => Promise<{ message_id: number }>;
			deleteMessage: (chatId: number, messageId: number) => Promise<unknown>;
		};
		chat?: { id: number; type?: string };
		from?: { id: number };
		t?: Translator;
	},
	tip: OptimizationTip,
	lifetimeMs: number = TIP_LIFETIME_MS,
): Promise<void> {
	// Translator-bearing contexts get the keyed rendering above;
	// translator-less contexts (tests, mocks) keep the plain format.
	const formattedTip = ctx.t ? renderTipMessage(tip, ctx.t) : formatTip(tip);

	try {
		if (ctx.chat?.id && ctx.from?.id) {
			const isGroupLike =
				ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";

			const sent = await ctx.api.sendMessage(ctx.chat.id, formattedTip, {
				...(isGroupLike && { receiver_user_id: ctx.from.id }),
			});

			// Make the tip ephemeral as advertised in the module docs. Deletion
			// can legitimately fail (manually deleted already, rate limited);
			// that must never surface as an error to anyone.
			const chatId = ctx.chat.id;
			setTimeout(() => {
				ctx.api.deleteMessage(chatId, sent.message_id).catch((error) => {
					_logger.debug(`Ephemeral tip cleanup failed: ${error}`);
				});
			}, lifetimeMs);
		}
	} catch (error) {
		_logger.error(`Failed to send tip: ${error}`);
	}
}
