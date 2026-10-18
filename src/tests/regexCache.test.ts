import { describe, expect, test } from "bun:test";
import { CONFIG } from "../config";
import { getCachedRegex } from "../utils";
import { getMetrics } from "../metrics";

// Cache behaviour can be turned off via CACHE_ENABLED; the identity and
// metric assertions below only make sense when it is on.
describe.skipIf(!CONFIG.CACHE_ENABLED)("regex cache wiring", () => {
	test("returns the same compiled instance for repeated patterns", () => {
		const first = getCachedRegex("cache-wire-a(\\d+)", "gi");
		const second = getCachedRegex("cache-wire-a(\\d+)", "gi");
		expect(second).toBe(first);
	});

	test("same pattern with different flags is cached separately", () => {
		const withG = getCachedRegex("cache-wire-b(\\d+)", "g");
		const withI = getCachedRegex("cache-wire-b(\\d+)", "i");
		expect(withI).not.toBe(withG);
	});

	test("records a compilation only when the pattern is actually compiled", () => {
		// Prime the cache with a unique pattern.
		getCachedRegex("cache-wire-c(\\d+)", "g");
		const afterMiss = getMetrics().totalRegexCompilations;

		getCachedRegex("cache-wire-c(\\d+)", "g");
		getCachedRegex("cache-wire-c(\\d+)", "g");
		expect(getMetrics().totalRegexCompilations).toBe(afterMiss);
	});

	test("cached /g instances stay usable across repeated test() calls", () => {
		// The database target matcher relies on resetting lastIndex before
		// each test(); this locks in that a shared cached instance can be
		// matched repeatedly without state leaking between calls.
		const regex = getCachedRegex("cache-wire-d", "g");
		regex.lastIndex = 0;
		expect(regex.test("cache-wire-d")).toBe(true);
		regex.lastIndex = 0;
		expect(regex.test("prefix cache-wire-d suffix")).toBe(true);
	});
});
