/**
 * Regex pattern explanation module
 *
 * Parses regex patterns and generates human-readable explanations
 */

import { escapeForMarkdownV2AndBackslashes } from "./utils";

/**
 * Token representing a part of a regex pattern
 */
interface RegexToken {
	type:
		| "anchor"
		| "quantifier"
		| "group"
		| "charclass"
		| "token"
		| "literal"
		| "escape";
	value: string;
	description: string;
}

/**
 * Parse a regex pattern into tokens
 */
export function parsePattern(pattern: string): RegexToken[] {
	const tokens: RegexToken[] = [];
	let i = 0;

	while (i < pattern.length) {
		const char = pattern[i];

		// Check for anchors
		if (char === "^" && i === 0) {
			tokens.push({
				type: "anchor",
				value: "^",
				description: "Start of string",
			});
			i++;
			continue;
		}

		if (char === "$" && i === pattern.length - 1) {
			tokens.push({
				type: "anchor",
				value: "$",
				description: "End of string",
			});
			i++;
			continue;
		}

		// Check for escaped characters
		if (char === "\\" && i + 1 < pattern.length) {
			const nextChar = pattern[i + 1];
			const escapeToken = parseEscape(nextChar);
			if (escapeToken) {
				tokens.push(escapeToken);
				i += 2;
				continue;
			}
		}

		// Check for groups
		if (char === "(") {
			const groupEnd = findMatchingParen(pattern, i);
			if (groupEnd > i) {
				const groupContent = pattern.slice(i, groupEnd + 1);
				const groupToken = parseGroup(groupContent);
				tokens.push(groupToken);
				i = groupEnd + 1;
				continue;
			}
		}

		// Check for character classes
		if (char === "[") {
			const classEnd = pattern.indexOf("]", i);
			if (classEnd > i) {
				const classContent = pattern.slice(i, classEnd + 1);
				const classToken = parseCharClass(classContent);
				tokens.push(classToken);
				i = classEnd + 1;
				continue;
			}
		}

		// Check for quantifiers on the previous token
		if (isQuantifier(char) && tokens.length > 0) {
			const quantifierDesc = getQuantifierDescription(char);
			tokens.push({
				type: "quantifier",
				value: char,
				description: quantifierDesc,
			});
			i++;
			continue;
		}

		// Check for curly brace quantifiers
		if (char === "{" && i + 1 < pattern.length) {
			const braceEnd = pattern.indexOf("}", i);
			if (braceEnd > i) {
				const quantifier = pattern.slice(i, braceEnd + 1);
				tokens.push({
					type: "quantifier",
					value: quantifier,
					description: getCurlyQuantifierDescription(quantifier),
				});
				i = braceEnd + 1;
				continue;
			}
		}

		// Default: literal character
		tokens.push({
			type: "literal",
			value: char,
			description: `Literal "${char}"`,
		});
		i++;
	}

	return tokens;
}

/**
 * Parse an escaped character
 */
function parseEscape(char: string): RegexToken | null {
	const escapeMap: Record<string, { value: string; desc: string }> = {
		d: { value: "\\d", desc: "Any digit (0-9)" },
		D: { value: "\\D", desc: "Any non-digit" },
		w: { value: "\\w", desc: "Any word character [a-zA-Z0-9_]" },
		W: { value: "\\W", desc: "Any non-word character" },
		s: { value: "\\s", desc: "Any whitespace" },
		S: { value: "\\S", desc: "Any non-whitespace" },
		t: { value: "\\t", desc: "Tab character" },
		n: { value: "\\n", desc: "Newline character" },
		r: { value: "\\r", desc: "Carriage return" },
		b: { value: "\\b", desc: "Word boundary" },
		B: { value: "\\B", desc: "Non-word boundary" },
	};

	if (escapeMap[char]) {
		return {
			type: "escape",
			value: escapeMap[char].value,
			description: escapeMap[char].desc,
		};
	}

	// For other escaped characters, it's a literal
	return {
		type: "escape",
		value: `\\${char}`,
		description: `Literal "${char}" (escaped)`,
	};
}

/**
 * Parse a group
 */
function parseGroup(content: string): RegexToken {
	// Check for non-capturing group
	if (content.startsWith("(?:")) {
		return {
			type: "group",
			value: content,
			description: "Non-capturing group",
		};
	}

	// Check for lookahead
	if (content.startsWith("(?=")) {
		return {
			type: "group",
			value: content,
			description: "Positive lookahead",
		};
	}

	// Check for negative lookahead
	if (content.startsWith("(?!")) {
		return {
			type: "group",
			value: content,
			description: "Negative lookahead",
		};
	}

	// Regular capturing group
	return {
		type: "group",
		value: content,
		description: "Capture group",
	};
}

/**
 * Parse a character class
 */
function parseCharClass(content: string): RegexToken {
	// Check for negated class
	if (content.startsWith("[^")) {
		return {
			type: "charclass",
			value: content,
			description: `Negated character class: ${content.slice(2, -1)}`,
		};
	}

	return {
		type: "charclass",
		value: content,
		description: `Character class: ${content.slice(1, -1)}`,
	};
}

/**
 * Check if a character is a quantifier
 */
function isQuantifier(char: string): boolean {
	return ["*", "+", "?"].includes(char);
}

/**
 * Get description for a simple quantifier
 */
function getQuantifierDescription(char: string): string {
	switch (char) {
		case "*":
			return "Zero or more times";
		case "+":
			return "One or more times";
		case "?":
			return "Zero or one time (optional)";
		default:
			return "Unknown quantifier";
	}
}

/**
 * Get description for curly brace quantifier
 */
function getCurlyQuantifierDescription(quantifier: string): string {
	const content = quantifier.slice(1, -1);

	if (content.includes(",")) {
		const [min, max] = content.split(",");
		if (max) {
			return `Between ${min} and ${max} times`;
		}
		return `At least ${min} times`;
	}

	return `Exactly ${content} times`;
}

/**
 * Find matching closing parenthesis
 */
function findMatchingParen(pattern: string, start: number): number {
	let depth = 1;
	let i = start + 1;

	while (i < pattern.length && depth > 0) {
		if (pattern[i] === "(") depth++;
		if (pattern[i] === ")") depth--;
		if (pattern[i] === "\\" && i + 1 < pattern.length) i++; // Skip escaped chars
		i++;
	}

	return depth === 0 ? i - 1 : -1;
}

/**
 * Generate explanation for a regex pattern
 */
export function explainPattern(pattern: string): string {
	if (!pattern || pattern.trim() === "") {
		return "Please provide a pattern to explain.\n\nUsage: /explain <pattern>\n\nExample: /explain \\d{3}-\\d{2}-\\d{4}";
	}

	// Validate pattern
	try {
		new RegExp(pattern);
	} catch (e) {
		return `Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}\n\nPlease check your syntax and try again.`;
	}

	// Truncate very long patterns
	const maxLength = 200;
	const isTruncated = pattern.length > maxLength;
	const displayPattern = isTruncated
		? pattern.slice(0, maxLength) + "..."
		: pattern;

	const tokens = parsePattern(
		isTruncated ? pattern.slice(0, maxLength) : pattern,
	);

	if (tokens.length === 0) {
		return "No tokens found in pattern.";
	}

	// Build explanation
	let explanation = `Pattern: ${escapeForMarkdownV2AndBackslashes(displayPattern)}\n\n`;
	explanation += "Breakdown:\n";

	for (const token of tokens) {
		const value = escapeForMarkdownV2AndBackslashes(token.value);
		const desc = escapeForMarkdownV2AndBackslashes(token.description);
		explanation += `• ${value}: ${desc}\n`;
	}

	if (isTruncated) {
		explanation += "\n(Pattern truncated for readability)";
	}

	return explanation;
}
