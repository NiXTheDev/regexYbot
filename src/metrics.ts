/**
 * Metrics tracking module for regexYbot
 *
 * Tracks performance metrics and statistics
 */

import { getRegexCacheStats } from "./utils";
import type { Translator } from "./i18n";
import type { WorkerPool } from "./workerPool";

// Simple in-memory metrics (resets on restart)
let totalSubstitutions = 0;
let totalRegexCompilations = 0;
const botStartTime = Date.now();

/**
 * Record a successful substitution
 */
export function recordSubstitution(): void {
	totalSubstitutions++;
}

/**
 * Record a regex compilation
 */
export function recordRegexCompilation(): void {
	totalRegexCompilations++;
}

/**
 * Get current metrics
 */
export function getMetrics(workerPool?: WorkerPool): MetricsData {
	const cacheStats = getRegexCacheStats();
	const workerStats = workerPool?.getStats();

	return {
		totalSubstitutions,
		totalRegexCompilations,
		cachedRegexes: cacheStats.size,
		cacheMaxSize: cacheStats.maxSize,
		cacheEnabled: cacheStats.enabled,
		cacheHits: cacheStats.hits,
		cacheMisses: cacheStats.misses,
		cacheHitRatio: cacheStats.hitRatio,
		uptime: Date.now() - botStartTime,
		workerStats: workerStats
			? {
					totalWorkers: workerStats.totalWorkers,
					idleWorkers: workerStats.idleWorkers,
					busyWorkers: workerStats.busyWorkers,
					queuedTasks: workerStats.queuedTasks,
					healthStatus: workerStats.health.status,
					errorRate: (workerStats.health.errorRate * 100).toFixed(1),
					avgQueueWaitMs: workerStats.avgQueueWaitMs,
					maxQueueWaitMs: workerStats.maxQueueWaitMs,
				}
			: null,
	};
}

/**
 * Format uptime for display
 */
export function formatUptime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days}d ${hours % 24}h ${minutes % 60}m`;
	}
	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	}
	return `${minutes}m ${seconds % 60}s`;
}

/**
 * Health status → translation key map. Values fall back to the raw
 * uppercase status when a status is missing from the map.
 */
const HEALTH_STATUS_KEYS: Record<string, string> = {
	healthy: "health-healthy",
	degraded: "health-degraded",
	unhealthy: "health-unhealthy",
};

/**
 * Format health status output
 * `t` resolves the localized chrome; the pool-less "UNKNOWN" fallback
 * and "Worker pool: Not available" stay literal (no keys defined).
 */
export function formatHealthStatus(
	metrics: MetricsData,
	t: Translator,
): string {
	const lines: string[] = [];

	const rawStatus = metrics.workerStats?.healthStatus;
	const statusWord = rawStatus
		? HEALTH_STATUS_KEYS[rawStatus]
			? t(HEALTH_STATUS_KEYS[rawStatus])
			: rawStatus.toUpperCase()
		: "UNKNOWN";

	lines.push(`${t("health-title")}: ${statusWord}\n`);

	if (metrics.workerStats) {
		lines.push(
			t("health-workers", {
				active: metrics.workerStats.busyWorkers,
				idle: metrics.workerStats.idleWorkers,
			}),
		);
		lines.push(t("health-queue", { pending: metrics.workerStats.queuedTasks }));
		lines.push(t("health-errorRate", { rate: metrics.workerStats.errorRate }));
	} else {
		lines.push("Worker pool: Not available");
	}

	lines.push(t("health-uptime", { uptime: formatUptime(metrics.uptime) }));

	return lines.join("\n");
}

/**
 * Format metrics output
 * `t` resolves the localized chrome; "Cache: Disabled" stays literal
 * (no key defined for the disabled branch).
 */
export function formatMetrics(metrics: MetricsData, t: Translator): string {
	const lines: string[] = [];

	lines.push(`${t("metrics-title")}:\n`);

	if (metrics.cacheEnabled) {
		const hitPercent = (metrics.cacheHitRatio * 100).toFixed(0);
		lines.push(
			t("metrics-cacheHitRate", {
				cached: metrics.cachedRegexes,
				max: metrics.cacheMaxSize,
				rate: hitPercent,
				misses: metrics.cacheMisses,
			}),
		);
	} else {
		lines.push("Cache: Disabled");
	}

	lines.push(
		t("metrics-totalSubstitutions", {
			count: metrics.totalSubstitutions.toLocaleString(),
		}),
	);
	lines.push(
		t("metrics-regexCompilations", {
			total: metrics.totalRegexCompilations.toLocaleString(),
			cached: metrics.cachedRegexes.toLocaleString(),
		}),
	);

	if (metrics.workerStats) {
		lines.push(
			t("metrics-avgProcessingTime", {
				time: metrics.workerStats.avgQueueWaitMs,
			}),
		);
		lines.push(
			t("metrics-maxQueueWait", { time: metrics.workerStats.maxQueueWaitMs }),
		);
	}

	return lines.join("\n");
}

/**
 * Metrics data interface
 */
export interface MetricsData {
	totalSubstitutions: number;
	totalRegexCompilations: number;
	cachedRegexes: number;
	cacheMaxSize: number;
	cacheEnabled: boolean;
	cacheHits: number;
	cacheMisses: number;
	cacheHitRatio: number;
	uptime: number;
	workerStats: {
		totalWorkers: number;
		idleWorkers: number;
		busyWorkers: number;
		queuedTasks: number;
		healthStatus: string;
		errorRate: string;
		avgQueueWaitMs: number;
		maxQueueWaitMs: number;
	} | null;
}
