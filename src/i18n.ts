/**
 * Internationalization setup using grammY i18n plugin
 *
 * Uses @grammyjs/i18n with Fluent format
 */

import { I18n, type I18nFlavor } from "@grammyjs/i18n";
import type { Context, SessionFlavor } from "grammy";
import type { CommandsFlavor } from "@grammyjs/commands";

// Session data interface
export interface SessionData {
	__language_code?: string;
}

// Context type with i18n and session support
export type MyContext = Context &
	CommandsFlavor &
	I18nFlavor &
	SessionFlavor<SessionData>;

/**
 * Available language codes
 */
export type LanguageCode =
	| "en" // English (default)
	| "de" // German
	| "it" // Italian
	| "pl" // Polish
	| "sv" // Swedish
	| "es" // Spanish
	| "ru" // Russian
	| "uk" // Ukrainian
	| "ja" // Japanese
	| "ko" // Korean
	| "zh"; // Chinese Simplified

/**
 * Language metadata for display
 */
export interface Language {
	code: LanguageCode;
	name: string;
	nativeName: string;
}

/**
 * Available languages
 */
export const AVAILABLE_LANGUAGES: Language[] = [
	{ code: "en", name: "English", nativeName: "English" },
	{ code: "de", name: "German", nativeName: "Deutsch" },
	{ code: "it", name: "Italian", nativeName: "Italiano" },
	{ code: "pl", name: "Polish", nativeName: "Polski" },
	{ code: "sv", name: "Swedish", nativeName: "Svenska" },
	{ code: "es", name: "Spanish", nativeName: "Español" },
	{ code: "ru", name: "Russian", nativeName: "Русский" },
	{ code: "uk", name: "Ukrainian", nativeName: "Українська" },
	{ code: "ja", name: "Japanese", nativeName: "日本語" },
	{ code: "ko", name: "Korean", nativeName: "한국어" },
	{ code: "zh", name: "Chinese (Simplified)", nativeName: "简体中文" },
];

/**
 * Initialize i18n with grammY plugin
 */
export const i18n = new I18n<MyContext>({
	defaultLocale: "en",
	useSession: true, // Store user language preference in session
	directory: "locales", // Load .ftl files from locales/
});

/**
 * Get language info by code
 */
export function getLanguageInfo(code: string): Language | undefined {
	return AVAILABLE_LANGUAGES.find((l) => l.code === code);
}

/**
 * Format language list for display
 */
export function formatLanguageList(): string {
	return AVAILABLE_LANGUAGES.map(
		(l) => `${l.code} - ${l.nativeName} (${l.name})`,
	).join("\n");
}

/**
 * Check if a language code is supported
 */
export function isSupportedLanguage(code: string): boolean {
	return AVAILABLE_LANGUAGES.some((l) => l.code === code);
}
