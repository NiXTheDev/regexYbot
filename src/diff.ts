import { parseSedCommands } from "./sed";
import { SED_PATTERN, getRegexFlags } from "./utils";

export type DiffFormat = "plain" | "true" | "image";

function escapeXml(unsafe: string): string {
	return unsafe.replace(/[&<>"']/g, (c) => {
		switch (c) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			case "'":
				return "&apos;";
			default:
				return c;
		}
	});
}

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
	if (format === "image") {
		return generateDiffImage(originalText, sedCommand);
	}

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

/**
 * Generate an SVG image showing the diff between original text and sed replacement.
 * Shows original matches with strikethrough in red, replacements in green.
 *
 * @param originalText - The original text to diff against
 * @param sedCommand - The sed command string (e.g., "s/pattern/replacement/gi")
 * @returns SVG string representing the diff image
 */
export function generateDiffImage(
	originalText: string,
	sedCommand: string,
): string {
	const processed = processDiff(originalText, sedCommand);

	const svgWidth = 600;
	const lineHeight = 22;
	const padding = 10;
	const fontSize = 14;

	if (!processed) {
		const height = padding * 2 + lineHeight;
		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${height}" style="background-color: #f5f5f5;">
  <text x="${padding}" y="${padding + fontSize}" font-family="Courier, monospace" font-size="${fontSize}" fill="#6b7280">
    No diff to display (no matches or invalid command)
  </text>
</svg>`;
	}

	const { replacement, uniqueMatches } = processed;
	const lineCount = uniqueMatches.length;
	const height = padding * 2 + lineCount * lineHeight;

	const lines = uniqueMatches
		.map((match, index) => {
			const y = padding + fontSize + index * lineHeight;
			const escapedMatch = escapeXml(match);
			const escapedReplacement = escapeXml(replacement);
			return `  <text x="${padding}" y="${y}" font-family="Courier, monospace" font-size="${fontSize}">
    <tspan style="text-decoration: line-through; fill: #dc2626;">${escapedMatch}</tspan>
    <tspan style="fill: #374151;"> → </tspan>
    <tspan style="fill: #16a34a; font-style: italic;">${escapedReplacement}</tspan>
  </text>`;
		})
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${height}" style="background-color: #f5f5f5;">
${lines}
</svg>`;
}
