import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC_DIR = join(import.meta.dir, "..");
const LOCALES_DIR = join(SRC_DIR, "locales");

/** Recursively collect .ts files under src/, excluding the test suite itself. */
function collectSourceFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirDir(dir)) {
		const full = join(dir, entry);
		if (entry === "tests") continue;
		if (entry.endsWith(".ts")) {
			files.push(full);
		} else if (!entry.includes(".")) {
			files.push(...collectSourceFiles(full));
		}
	}
	return files;
}

function readdirDir(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).map((d) => d.name);
}

/** Parse the message IDs defined in a Fluent (.ftl) file. */
function parseKeys(ftl: string): Set<string> {
	const keys = new Set<string>();
	for (const line of ftl.split("\n")) {
		const match = /^([a-zA-Z][a-zA-Z0-9_-]*)\s*=/.exec(line);
		const key = match?.[1];
		if (key) keys.add(key);
	}
	return keys;
}

/** Find every literal translation key referenced via ctx.t / ctx.i18n.t. */
function referencedKeys(source: string): string[] {
	const pattern = /ctx(?:\.i18n)?\.t\(\s*["']([^"']+)["']/g;
	const keys: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source)) !== null) {
		const key = match[1];
		if (key) keys.push(key);
	}
	return keys;
}

describe("i18n key coverage", () => {
	test("every key referenced in source exists in the default locale (en)", () => {
		const enKeys = parseKeys(
			readFileSync(join(LOCALES_DIR, "en.ftl"), "utf-8"),
		);
		const missing: string[] = [];

		for (const file of collectSourceFiles(SRC_DIR)) {
			const source = readFileSync(file, "utf-8");
			for (const key of referencedKeys(source)) {
				if (!enKeys.has(key)) {
					missing.push(`${key} (used in ${file.replace(SRC_DIR, "src")})`);
				}
			}
		}

		expect(missing).toEqual([]);
	});

	test("referenced keys are non-trivial (guards against empty strings)", () => {
		const enKeys = parseKeys(
			readFileSync(join(LOCALES_DIR, "en.ftl"), "utf-8"),
		);
		const files = collectSourceFiles(SRC_DIR);
		let references = 0;
		for (const file of files) {
			references += referencedKeys(readFileSync(file, "utf-8")).length;
		}
		// If this ever reads 0, the scanner has silently stopped matching.
		expect(references).toBeGreaterThan(0);
		expect(enKeys.size).toBeGreaterThan(0);
	});
});
