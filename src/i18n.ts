/**
 * Internationalization setup using grammY i18n plugin
 *
 * Uses @grammyjs/i18n with Fluent format
 */

import { I18n, type I18nFlavor } from "@grammyjs/i18n";
import type { Context } from "grammy";
import type { CommandsFlavor } from "@grammyjs/commands";
import type { HydrateFlavor } from "@grammyjs/hydrate";
import type { SessionFlavor } from "./session";

import enLocaleSource from "./locales/en.ftl" with { type: "text" };
import deLocaleSource from "./locales/de.ftl" with { type: "text" };
import itLocaleSource from "./locales/it.ftl" with { type: "text" };
import plLocaleSource from "./locales/pl.ftl" with { type: "text" };
import svLocaleSource from "./locales/sv.ftl" with { type: "text" };
import esLocaleSource from "./locales/es.ftl" with { type: "text" };
import ruLocaleSource from "./locales/ru.ftl" with { type: "text" };
import ukLocaleSource from "./locales/uk.ftl" with { type: "text" };
import jaLocaleSource from "./locales/ja.ftl" with { type: "text" };
import koLocaleSource from "./locales/ko.ftl" with { type: "text" };
import zhLocaleSource from "./locales/zh.ftl" with { type: "text" };

// Session data interface
export interface SessionData {
	__language_code?: string;
}

// Context type with i18n and session support.
// grammY v2 no longer ships a `session` flavor, so it is provided by our own
// in-memory session middleware instead (see ./session.ts).
export type MyContext = HydrateFlavor<
	Context & CommandsFlavor & I18nFlavor & SessionFlavor<SessionData>
>;

/**
 * A translation function already bound to a locale, for modules that
 * need localized chrome (metrics formatters, help text, tips) without
 * carrying a full Telegram context around.
 */
export type Translator = (
	key: string,
	args?: Record<string, string | number>,
) => string;

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
 * Fluent translation sources for every supported locale, imported as
 * inline text.
 *
 * This deliberately replaces the previous `directory:
 * path.resolve("src/locales")` plugin option: a runtime fs path only
 * works when the process is started from a working directory that
 * contains `src/locales/`, which `bun build --compile` binaries do not
 * have (the plugin walks the directory in its constructor and throws
 * ENOENT at boot, so shipped executables crashed unless run from a
 * repository checkout). Text imports are inlined into `bun run` and
 * embedded into compiled binaries alike, with no CWD dependence.
 */
const LOCALE_SOURCES: ReadonlyArray<[locale: LanguageCode, source: string]> = [
	["en", enLocaleSource],
	["de", deLocaleSource],
	["it", itLocaleSource],
	["pl", plLocaleSource],
	["sv", svLocaleSource],
	["es", esLocaleSource],
	["ru", ruLocaleSource],
	["uk", ukLocaleSource],
	["ja", jaLocaleSource],
	["ko", koLocaleSource],
	["zh", zhLocaleSource],
];

/**
 * Initialize i18n with grammY plugin
 */
export const i18n = new I18n<MyContext>({
	defaultLocale: "en",
	useSession: true, // Persist the chosen language in the session (see ./session.ts)
});

for (const [locale, source] of LOCALE_SOURCES) {
	// loadLocaleSync derives isDefault ("en") from defaultLocale and
	// tracks the locale in i18n.locales, exactly like the previous
	// directory-based loading did.
	i18n.loadLocaleSync(locale, { source });
}

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
