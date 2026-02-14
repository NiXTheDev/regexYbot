// utils.ts
import { LRUCache } from "./lruCache";
import { CONFIG } from "./config";

// Regex for sed command, reverting to the original non-greedy version.
export const SED_PATTERN =
	/^s\/((?:\\.|[^/])+?)\/((?:\\.|[^/])*?)(?:\/([^]*))?$/;

// LRU Cache for compiled regex patterns with TTL support
const regexCache = new LRUCache<string, RegExp>(
	CONFIG.CACHE_MAX_SIZE,
	CONFIG.CACHE_TTL_MS,
);

/**
 * Get or create a cached compiled regex
 * @param pattern - The regex pattern string
 * @param flags - Regex flags (e.g., 'gi')
 * @returns Compiled RegExp
 */
export function getCachedRegex(pattern: string, flags: string): RegExp {
	if (!CONFIG.CACHE_ENABLED) {
		return new RegExp(pattern, flags);
	}

	const key = `${pattern}:${flags}`;
	let regex = regexCache.get(key);

	if (!regex) {
		regex = new RegExp(pattern, flags);
		regexCache.set(key, regex);
	}

	return regex;
}

/**
 * Get cache stats for monitoring
 */
export function getRegexCacheStats(): {
	size: number;
	maxSize: number;
	ttl: number;
	enabled: boolean;
} {
	return {
		size: regexCache.size,
		maxSize: CONFIG.CACHE_MAX_SIZE,
		ttl: CONFIG.CACHE_TTL_MS,
		enabled: CONFIG.CACHE_ENABLED,
	};
}

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
	escapedText = escapedText.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
	return escapedText;
}
