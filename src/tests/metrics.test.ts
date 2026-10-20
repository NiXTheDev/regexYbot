import { describe, expect, test } from "bun:test";
import {
	formatHealthStatus,
	formatMetrics,
	type MetricsData,
} from "../metrics";
import type { Translator } from "../i18n";

// Mirror of the en.ftl chrome so the formatter layout stays pinned even
// as translations evolve. Unknown keys fall through to the key itself.
const en: Translator = (key, args) => {
	switch (key) {
		case "health-title":
			return "Bot Health Status";
		case "health-healthy":
			return "HEALTHY";
		case "health-degraded":
			return "DEGRADED";
		case "health-unhealthy":
			return "UNHEALTHY";
		case "health-workers":
			return `Workers: ${args?.["active"]} active, ${args?.["idle"]} idle`;
		case "health-queue":
			return `Queue: ${args?.["pending"]} pending tasks`;
		case "health-errorRate":
			return `Error Rate: ${args?.["rate"]}%`;
		case "health-uptime":
			return `Uptime: ${args?.["uptime"]}`;
		case "metrics-title":
			return "Performance Metrics";
		case "metrics-cacheHitRate":
			return `Cache: ${args?.["cached"]}/${args?.["max"]} (${args?.["rate"]}% hits, ${args?.["misses"]} misses)`;
		case "metrics-totalSubstitutions":
			return `Total Substitutions: ${args?.["count"]}`;
		case "metrics-regexCompilations":
			return `Regex Compilations: ${args?.["total"]} (cached: ${args?.["cached"]})`;
		case "metrics-avgProcessingTime":
			return `Avg Queue Wait: ${args?.["time"]}ms`;
		case "metrics-maxQueueWait":
			return `Max Queue Wait: ${args?.["time"]}ms`;
		default:
			return key;
	}
};

// Counts stay below 1000 so toLocaleString() cannot introduce
// locale-dependent thousands separators into the expectations.
function metricsFixture(overrides: Partial<MetricsData> = {}): MetricsData {
	return {
		totalSubstitutions: 999,
		totalRegexCompilations: 12,
		cachedRegexes: 5,
		cacheMaxSize: 10,
		cacheEnabled: true,
		cacheHits: 40,
		cacheMisses: 30,
		cacheHitRatio: 0.25,
		uptime: 0,
		workerStats: {
			totalWorkers: 4,
			idleWorkers: 1,
			busyWorkers: 2,
			queuedTasks: 3,
			healthStatus: "healthy",
			errorRate: "12.3",
			avgQueueWaitMs: 45,
			maxQueueWaitMs: 120,
		},
		...overrides,
	};
}

describe("formatHealthStatus", () => {
	test("renders the translated health view for a healthy pool", () => {
		expect(formatHealthStatus(metricsFixture(), en)).toBe(
			"Bot Health Status: HEALTHY\n\nWorkers: 2 active, 1 idle\nQueue: 3 pending tasks\nError Rate: 12.3%\nUptime: 0m 0s",
		);
	});

	test("falls back to the untranslated pool-less view", () => {
		expect(formatHealthStatus(metricsFixture({ workerStats: null }), en)).toBe(
			"Bot Health Status: UNKNOWN\n\nWorker pool: Not available\nUptime: 0m 0s",
		);
	});
});

describe("formatMetrics", () => {
	test("renders the translated metrics view", () => {
		expect(formatMetrics(metricsFixture(), en)).toBe(
			"Performance Metrics:\n\nCache: 5/10 (25% hits, 30 misses)\nTotal Substitutions: 999\nRegex Compilations: 12 (cached: 5)\nAvg Queue Wait: 45ms\nMax Queue Wait: 120ms",
		);
	});

	test("keeps the disabled-cache literal when the cache is off", () => {
		const out = formatMetrics(metricsFixture({ cacheEnabled: false }), en);
		expect(out).toContain("\nCache: Disabled\n");
		expect(out).toContain("Total Substitutions: 999");
		expect(out).toContain("Avg Queue Wait: 45ms");
	});
});
