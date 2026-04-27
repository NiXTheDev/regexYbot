import { parseSedCommands } from "./sed";
import { SED_PATTERN, getRegexFlags } from "./utils";

/**
 * Compute a markdown diff between original text and what a sed command would produce.
 * Returns formatted diff showing matches as ~~match~~ *replacement*
 *
 * @param originalText - The original text to diff against
 * @param sedCommand - The sed command string (e.g., "s/pattern/replacement/gi")
 * @returns Markdown formatted diff string
 */
export function computeDiff(originalText: string, sedCommand: string): string {
	// Parse the sed commands from the command string
	const commandStrings = parseSedCommands(sedCommand);

	if (commandStrings.length === 0) {
		return originalText;
	}

	// Process the first command only (for single diff operation)
	const commandString = commandStrings[0];
	const match = commandString.match(SED_PATTERN);

	if (!match) {
		return originalText;
	}

	// Extract pattern and replacement from the match
	// match[1] = pattern, match[2] = replacement, match[3] = flags
	const rawPattern = match[1];
	const rawReplacement = match[2];
	const flagsMatch = match[3];

	// Unescape forward slashes in pattern and replacement
	const pattern = rawPattern.replace(/\\\//g, "/");
	const replacement = rawReplacement
		.replace(/\\\//g, "/")
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t");

	// Get regex flags
	const { flags } = getRegexFlags(flagsMatch);

	// Ensure global flag is present for matching all occurrences
	const regexFlags = flags.includes("g") ? flags : flags + "g";

	try {
		const regex = new RegExp(pattern, regexFlags);
		const matches = originalText.match(regex);

		if (!matches || matches.length === 0) {
			return originalText;
		}

		// Build diff output with unique matches
		const uniqueMatches = [...new Set(matches)];
		const diffParts: string[] = [];

		for (const matchText of uniqueMatches) {
			// Format each match as ~~match~~ *replacement*
			diffParts.push(`~~${matchText}~~ *${replacement}*`);
		}

		return diffParts.join("\n");
	} catch {
		// Invalid regex - return original text
		return originalText;
	}
}
