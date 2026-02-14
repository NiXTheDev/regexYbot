import { Logger } from "./logger";

const logger = new Logger("HealthMonitor");

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthMetrics {
	totalWorkers: number;
	idleWorkers: number;
	busyWorkers: number;
	queuedTasks: number;
	pendingTasks: number;
	averageTaskDuration: number;
	errorRate: number;
	status: HealthStatus;
}

export interface HealthCheckConfig {
	enabled: boolean;
	intervalMs: number;
	workerThreshold: number;
	queueThreshold: number;
	errorRateThreshold: number;
}

/**
 * HealthMonitor - Internal health monitoring for worker pools
 *
 * Tracks pool statistics and determines health status without external infrastructure.
 * All metrics are kept in-memory, no persistence or HTTP endpoints.
 */
export class HealthMonitor {
	private config: HealthCheckConfig;
	private taskDurations: number[] = [];
	private errorCount = 0;
	private successCount = 0;
	private lastStatus: HealthStatus = "healthy";
	private checkInterval: NodeJS.Timeout | null = null;

	constructor(config: Partial<HealthCheckConfig> = {}) {
		this.config = {
			enabled: config.enabled ?? true,
			intervalMs: config.intervalMs ?? 60000,
			workerThreshold: config.workerThreshold ?? 1,
			queueThreshold: config.queueThreshold ?? 100,
			errorRateThreshold: config.errorRateThreshold ?? 0.1,
		};

		if (this.config.enabled) {
			this.startMonitoring();
		}
	}

	/**
	 * Record a successful task completion
	 */
	recordSuccess(durationMs: number): void {
		this.successCount++;
		this.taskDurations.push(durationMs);

		// Keep only last 100 measurements
		if (this.taskDurations.length > 100) {
			this.taskDurations.shift();
		}
	}

	/**
	 * Record a failed task
	 */
	recordError(): void {
		this.errorCount++;
	}

	/**
	 * Calculate health metrics from current pool state
	 */
	calculateHealth(
		totalWorkers: number,
		idleWorkers: number,
		queuedTasks: number,
		pendingTasks: number,
	): HealthMetrics {
		const busyWorkers = totalWorkers - idleWorkers;
		const averageTaskDuration = this.calculateAverageDuration();
		const errorRate = this.calculateErrorRate();

		// Determine health status
		let status: HealthStatus = "healthy";

		// Check worker count
		if (totalWorkers < this.config.workerThreshold) {
			status = "degraded";
		}

		// Check queue depth
		if (queuedTasks > this.config.queueThreshold) {
			status =
				queuedTasks > this.config.queueThreshold * 2 ? "unhealthy" : "degraded";
		}

		// Check error rate
		if (errorRate > this.config.errorRateThreshold) {
			status =
				errorRate > this.config.errorRateThreshold * 2
					? "unhealthy"
					: "degraded";
		}

		const metrics: HealthMetrics = {
			totalWorkers,
			idleWorkers,
			busyWorkers,
			queuedTasks,
			pendingTasks,
			averageTaskDuration,
			errorRate,
			status,
		};

		// Log status changes
		if (status !== this.lastStatus) {
			logger.warn(
				`Health status changed from ${this.lastStatus} to ${status}: ` +
					`workers=${totalWorkers}, queue=${queuedTasks}, errorRate=${(errorRate * 100).toFixed(1)}%`,
			);
			this.lastStatus = status;
		}

		return metrics;
	}

	/**
	 * Get current health status
	 */
	getStatus(): HealthStatus {
		return this.lastStatus;
	}

	/**
	 * Stop health monitoring
	 */
	stop(): void {
		if (this.checkInterval) {
			clearInterval(this.checkInterval);
			this.checkInterval = null;
		}
	}

	/**
	 * Reset error and success counters
	 */
	resetCounters(): void {
		this.errorCount = 0;
		this.successCount = 0;
		this.taskDurations = [];
	}

	private calculateAverageDuration(): number {
		if (this.taskDurations.length === 0) return 0;
		const sum = this.taskDurations.reduce((a, b) => a + b, 0);
		return sum / this.taskDurations.length;
	}

	private calculateErrorRate(): number {
		const total = this.successCount + this.errorCount;
		if (total === 0) return 0;
		return this.errorCount / total;
	}

	private startMonitoring(): void {
		// Periodic health check logging
		this.checkInterval = setInterval(() => {
			if (this.lastStatus !== "healthy") {
				logger.info(
					`Health check: status=${this.lastStatus}, ` +
						`errorRate=${(this.calculateErrorRate() * 100).toFixed(1)}%, ` +
						`avgDuration=${this.calculateAverageDuration().toFixed(0)}ms`,
				);
			}
		}, this.config.intervalMs);

		// Unref so it doesn't keep process alive
		this.checkInterval.unref();
	}
}
