/**
 * Metrics tracking module for regexYbot
 *
 * Tracks performance metrics and statistics
 */

import { getRegexCacheStats } from "./utils";
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
		uptime: Date.now() - botStartTime,
		workerStats: workerStats
			? {
					totalWorkers: workerStats.totalWorkers,
					idleWorkers: workerStats.idleWorkers,
					busyWorkers: workerStats.busyWorkers,
					queuedTasks: workerStats.queuedTasks,
					healthStatus: workerStats.health.status,
					errorRate: (workerStats.health.errorRate * 100).toFixed(1),
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
 * Format health status output
 */
export function formatHealthStatus(metrics: MetricsData): string {
	const lines: string[] = [];

	lines.push(
		`Bot Health Status: ${metrics.workerStats?.healthStatus.toUpperCase() ?? "UNKNOWN"}\n`,
	);

	if (metrics.workerStats) {
		lines.push(
			`Workers: ${metrics.workerStats.busyWorkers} active, ${metrics.workerStats.idleWorkers} idle`,
		);
		lines.push(`Queue: ${metrics.workerStats.queuedTasks} pending tasks`);
		lines.push(`Error Rate: ${metrics.workerStats.errorRate}%`);
	} else {
		lines.push("Worker pool: Not available");
	}

	lines.push(`Uptime: ${formatUptime(metrics.uptime)}`);

	return lines.join("\n");
}

/**
 * Format metrics output
 */
export function formatMetrics(metrics: MetricsData): string {
	const lines: string[] = [];

	lines.push("Performance Metrics:\n");

	if (metrics.cacheEnabled) {
		const hitRate =
			metrics.cachedRegexes > 0
				? ((metrics.cachedRegexes / metrics.cacheMaxSize) * 100).toFixed(0)
				: "0";
		lines.push(
			`Cache: ${metrics.cachedRegexes}/${metrics.cacheMaxSize} entries (${hitRate}% full)`,
		);
	} else {
		lines.push("Cache: Disabled");
	}

	lines.push(
		`Total Substitutions: ${metrics.totalSubstitutions.toLocaleString()}`,
	);
	lines.push(
		`Regex Compilations: ${metrics.totalRegexCompilations.toLocaleString()}`,
	);

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
	uptime: number;
	workerStats: {
		totalWorkers: number;
		idleWorkers: number;
		busyWorkers: number;
		queuedTasks: number;
		healthStatus: string;
		errorRate: string;
	} | null;
}
