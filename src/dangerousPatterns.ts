/**
 * Dangerous regex pattern detection module
 *
 * Detects patterns that could cause catastrophic backtracking or ReDoS
 */

/**
 * Represents a detected dangerous pattern
 */
export interface DangerousPatternResult {
	detected: boolean;
	pattern: string;
	issues: PatternIssue[];
	complexityScore: number; // 0-100
}

/**
 * Individual pattern issue
 */
export interface PatternIssue {
	type: string;
	description: string;
	severity: "low" | "medium" | "high";
	suggestion?: string;
}

/**
 * Detect dangerous patterns in a regex
 */
export function detectDangerousPattern(
	pattern: string,
): DangerousPatternResult {
	const issues: PatternIssue[] = [];
	let complexityScore = 0;

	// Check for nested quantifiers (e.g., (a+)+, (a*)*)
	const nestedQuantifierMatch = checkNestedQuantifiers(pattern);
	if (nestedQuantifierMatch) {
		issues.push(nestedQuantifierMatch);
		complexityScore += 40;
	}

	// Check for quantified alternation (e.g., (a|b)+)
	const alternationMatch = checkQuantifiedAlternation(pattern);
	if (alternationMatch) {
		issues.push(alternationMatch);
		complexityScore += 30;
	}

	// Check for multiple wildcards
	const wildcardMatch = checkMultipleWildcards(pattern);
	if (wildcardMatch) {
		issues.push(wildcardMatch);
		complexityScore += 25;
	}

	// Check for overlapping character classes with quantifiers
	const overlappingMatch = checkOverlappingPatterns(pattern);
	if (overlappingMatch) {
		issues.push(overlappingMatch);
		complexityScore += 20;
	}

	// Check for excessive quantifiers
	const excessiveMatch = checkExcessiveQuantifiers(pattern);
	if (excessiveMatch) {
		issues.push(excessiveMatch);
		complexityScore += 15;
	}

	// Check for polynomial-time patterns (less severe)
	const polynomialMatch = checkPolynomialPatterns(pattern);
	if (polynomialMatch) {
		issues.push(polynomialMatch);
		complexityScore += 10;
	}

	return {
		detected: issues.length > 0,
		pattern,
		issues,
		complexityScore: Math.min(complexityScore, 100),
	};
}

/**
 * Check for nested quantifiers like (a+)+, (a*)*, (a+)*
 */
function checkNestedQuantifiers(pattern: string): PatternIssue | null {
	// Pattern: group followed by quantifier, where group contains quantified element
	const nestedQuantifierRegex = /\([^)]*[*+][^)]*\)[*+?]/;

	if (nestedQuantifierRegex.test(pattern)) {
		// More specific check - look for actual nested quantification
		const specificNested =
			/\([^)]*\+[^)]*\)\+|\([^)]*\*[^)]*\)\*|\([^)]*\+[^)]*\)\*/;

		if (specificNested.test(pattern)) {
			return {
				type: "nested_quantifiers",
				description:
					"Nested quantifiers (e.g., (a+)+) can cause exponential execution time",
				severity: "high",
				suggestion:
					"Consider using atomic groups (?>...) or possessive quantifiers (++ or *+)",
			};
		}
	}

	return null;
}

/**
 * Check for quantified alternation like (a|b)+, (foo|bar)*
 */
function checkQuantifiedAlternation(pattern: string): PatternIssue | null {
	// Pattern: alternation inside group, followed by quantifier
	const quantifiedAltRegex = /\([^)]*\|[^)]*\)[*+?]/;

	if (quantifiedAltRegex.test(pattern)) {
		return {
			type: "quantified_alternation",
			description:
				"Quantified alternation (e.g., (a|b)+) can cause exponential backtracking on failure",
			severity: "high",
			suggestion:
				"Consider using non-capturing groups or restructuring the pattern",
		};
	}

	return null;
}

/**
 * Check for multiple wildcards in sequence
 */
function checkMultipleWildcards(pattern: string): PatternIssue | null {
	// Pattern: multiple .* or .+ in sequence
	const multipleWildcardsRegex = /(\.\*[^)]*\.\*|\.\+[^)]*\.\+)/;

	if (multipleWildcardsRegex.test(pattern)) {
		return {
			type: "multiple_wildcards",
			description:
				"Multiple wildcards (e.g., .*.*) can cause polynomial or exponential backtracking",
			severity: "medium",
			suggestion: "Consider using more specific patterns or anchors (^, $)",
		};
	}

	return null;
}

/**
 * Check for overlapping character classes with quantifiers
 */
function checkOverlappingPatterns(pattern: string): PatternIssue | null {
	// Pattern: similar character classes with quantifiers that can overlap
	const overlappingRegex = /(\[\w+\]|\\w|\.)[*+]\s*(\[\w+\]|\\w|\.)[*+]/;

	if (overlappingRegex.test(pattern)) {
		return {
			type: "overlapping_patterns",
			description:
				"Overlapping character classes with quantifiers can cause backtracking",
			severity: "medium",
			suggestion: "Make character classes mutually exclusive or add anchors",
		};
	}

	return null;
}

/**
 * Check for excessive quantifier usage
 */
function checkExcessiveQuantifiers(pattern: string): PatternIssue | null {
	// Count quantifiers
	const quantifierMatches = pattern.match(/[*+?]|\{\d+,?\d*\}/g);

	if (quantifierMatches && quantifierMatches.length >= 4) {
		return {
			type: "excessive_quantifiers",
			description: `Pattern contains ${quantifierMatches.length} quantifiers, which may impact performance`,
			severity: "low",
			suggestion:
				"Consider simplifying the pattern or using specific character classes",
		};
	}

	return null;
}

/**
 * Check for polynomial-time patterns (less severe but worth noting)
 */
function checkPolynomialPatterns(pattern: string): PatternIssue | null {
	// Pattern with unbounded repetition and optional components
	const polynomialRegex = /\(.*\*.*\?.*\)|\(.*\?.*\*.*\)/;

	if (polynomialRegex.test(pattern)) {
		return {
			type: "polynomial_complexity",
			description: "Pattern may have polynomial complexity on certain inputs",
			severity: "low",
			suggestion: "Consider using possessive quantifiers or atomic groups",
		};
	}

	return null;
}

/**
 * Format a warning message for dangerous patterns
 */
export function formatDangerousPatternWarning(
	result: DangerousPatternResult,
): string {
	if (!result.detected) {
		return "";
	}

	const lines: string[] = [];

	lines.push("⚠️ Warning: This pattern may cause performance issues\n");
	lines.push(`Pattern: \`${result.pattern}\``);
	lines.push(`Risk Score: ${result.complexityScore}/100\n`);

	lines.push("Issues found:");
	for (const issue of result.issues) {
		const severityEmoji =
			issue.severity === "high"
				? "🔴"
				: issue.severity === "medium"
					? "🟡"
					: "🟢";
		lines.push(`${severityEmoji} ${issue.description}`);
		if (issue.suggestion) {
			lines.push(`   💡 ${issue.suggestion}`);
		}
	}

	lines.push(
		"\nThe bot will still execute this pattern, but it may be slow on certain inputs.",
	);

	return lines.join("\n");
}

/**
 * Quick check if a pattern is safe (for simple cases)
 */
export function isSimplePattern(pattern: string): boolean {
	// Simple patterns don't need checking
	// - Literal strings
	// - Simple character classes without quantifiers
	// - Anchored patterns with limited complexity

	if (pattern.length < 5) return true;

	// Check for any quantifiers
	if (!/[*+?]|\{/.test(pattern)) return true;

	// Check for complex group structures
	if (/\([^)]*\|/.test(pattern)) return false;

	return false;
}

/**
 * Analyze pattern complexity for informational purposes
 */
export function analyzePatternComplexity(pattern: string): {
	score: number;
	level: "simple" | "moderate" | "complex" | "dangerous";
} {
	const result = detectDangerousPattern(pattern);

	let level: "simple" | "moderate" | "complex" | "dangerous";
	if (result.complexityScore === 0) {
		level = "simple";
	} else if (result.complexityScore < 30) {
		level = "moderate";
	} else if (result.complexityScore < 60) {
		level = "complex";
	} else {
		level = "dangerous";
	}

	return {
		score: result.complexityScore,
		level,
	};
}
