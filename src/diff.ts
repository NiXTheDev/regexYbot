import { parseSedCommands } from "./sed";
import { SED_PATTERN, getRegexFlags } from "./utils";

export type DiffFormat = "plain" | "true" | "image";

function processDiff(
	originalText: string,
	sedCommand: string,
): { replacement: string; uniqueMatches: string[] } | null {
	const commandStrings = parseSedCommands(sedCommand);

	if (commandStrings.length === 0) {
		return null;
	}

	const commandString = commandStrings[0];
	const match = commandString.match(SED_PATTERN);

	if (!match) {
		return null;
	}

	const rawPattern = match[1];
	const rawReplacement = match[2];
	const flagsMatch = match[3];

	const pattern = rawPattern.replace(/\\\//g, "/");
	const replacement = rawReplacement
		.replace(/\\\//g, "/")
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t");

	const { flags } = getRegexFlags(flagsMatch);
	const regexFlags = flags.includes("g") ? flags : flags + "g";

	try {
		const regex = new RegExp(pattern, regexFlags);
		const matches = originalText.match(regex);

		if (!matches || matches.length === 0) {
			return null;
		}

		const uniqueMatches = [...new Set(matches)];
		return { replacement, uniqueMatches };
	} catch {
		return null;
	}
}

/**
 * Compute a diff between original text and what a sed command would produce.
 * Supports multiple output formats.
 *
 * @param originalText - The original text to diff against
 * @param sedCommand - The sed command string (e.g., "s/pattern/replacement/gi")
 * @param format - Output format: 'plain' (default, ~~match~~ *replacement*), 'true' (markdown diff block), 'image' (reserved)
 * @returns Formatted diff string based on the specified format
 */
export function computeDiff(
	originalText: string,
	sedCommand: string,
	format: DiffFormat = "plain",
): string {
	const processed = processDiff(originalText, sedCommand);
	if (!processed) {
		return originalText;
	}

	const { replacement, uniqueMatches } = processed;

	switch (format) {
		case "plain":
			return uniqueMatches
				.map((matchText) => `~~${matchText}~~ *${replacement}*`)
				.join("\n");
		case "true": {
			const diffLines = uniqueMatches
				.flatMap((matchText) => [`- ${matchText}`, `+ ${replacement}`])
				.join("\n");
			return `\`\`\`diff\n${diffLines}\n\`\`\``;
		}
		case "image":
			// Image format is not yet implemented, return original text for now
			return originalText;
		default:
			return originalText;
	}
}

/**
 * Compute a markdown diff block between original text and what a sed command would produce.
 * Returns a code block with ```diff ... ``` containing - original and + replacement lines.
 *
 * @param originalText - The original text to diff against
 * @param sedCommand - The sed command string (e.g., "s/pattern/replacement/gi")
 * @returns Markdown diff code block string
 */
export function computeDiffMarkdown(
	originalText: string,
	sedCommand: string,
): string {
	return computeDiff(originalText, sedCommand, "true");
}
