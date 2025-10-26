// utils.ts
import { LogLevel } from "./types";

// Regex for sed command, reverting to the original non-greedy version.
export const SED_PATTERN =
	/^s\/((?:\\.|[^\/])+?)\/((?:\\.|[^\/])*?)(?:\/([^]*))?$/;

// Helper function to get regex flags from a sed command
export function getRegexFlags(flagsMatch: string | undefined): {
	flags: string;
	originalFlags: string | undefined;
} {
	if (!flagsMatch) return { flags: "", originalFlags: undefined };
	const originalFlags = flagsMatch;
	const rawFlags = flagsMatch;
	const standardFlagChars = ["g", "i", "m", "s", "u", "y"];
	const flags = Array.from(new Set(rawFlags))
		.filter((char) => standardFlagChars.includes(char.toLowerCase()))
		.map((char) => char.toLowerCase())
		.sort()
		.join("");
	return { flags, originalFlags };
}

// Function to escape MarkdownV2 special characters and literal backslashes correctly
export function escapeForMarkdownV2AndBackslashes(text: string): string {
	// First, escape any literal backslashes in the original text.
	let escapedText = text.replace(/\\/g, "\\\\");
	// Then, escape all MarkdownV2 special characters with a single backslash.
	escapedText = escapedText.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
	return escapedText;
}
