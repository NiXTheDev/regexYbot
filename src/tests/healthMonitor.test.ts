import { describe, test, expect, beforeEach } from "bun:test";
import { HealthMonitor } from "../healthMonitor";

describe("HealthMonitor", () => {
	let monitor: HealthMonitor;

	beforeEach(() => {
		monitor = new HealthMonitor({
			enabled: true,
			intervalMs: 1000,
			workerThreshold: 1,
			queueThreshold: 10,
			errorRateThreshold: 0.1,
		});
	});

	test("should initialize with default config", () => {
		const defaultMonitor = new HealthMonitor();
		expect(defaultMonitor.getStatus()).toBe("healthy");
	});

	test("should record successful tasks", () => {
		monitor.recordSuccess(100);
		monitor.recordSuccess(200);

		const metrics = monitor.calculateHealth(2, 1, 0, 0);
		expect(metrics.averageTaskDuration).toBe(150);
		expect(metrics.errorRate).toBe(0);
	});

	test("should record errors", () => {
		monitor.recordSuccess(100);
		monitor.recordError();
		monitor.recordError();

		const metrics = monitor.calculateHealth(2, 1, 0, 0);
		expect(metrics.errorRate).toBeCloseTo(0.666, 2);
	});

	test("should return healthy status when all metrics good", () => {
		monitor.recordSuccess(100);
		monitor.recordSuccess(100);

		const metrics = monitor.calculateHealth(2, 1, 5, 0);
		expect(metrics.status).toBe("healthy");
	});

	test("should return degraded status when workers below threshold", () => {
		monitor.recordSuccess(100);

		const metrics = monitor.calculateHealth(0, 0, 0, 0);
		expect(metrics.status).toBe("degraded");
	});

	test("should return degraded status when queue above threshold", () => {
		monitor.recordSuccess(100);

		const metrics = monitor.calculateHealth(2, 1, 15, 0);
		expect(metrics.status).toBe("degraded");
	});

	test("should return unhealthy status when queue far above threshold", () => {
		monitor.recordSuccess(100);

		const metrics = monitor.calculateHealth(2, 1, 25, 0);
		expect(metrics.status).toBe("unhealthy");
	});

	test("should return degraded status when error rate moderately above threshold", () => {
		// With threshold 0.1, degraded is >0.1 and <=0.2, unhealthy is >0.2
		monitor.recordSuccess(100);
		monitor.recordSuccess(100);
		monitor.recordSuccess(100);
		monitor.recordSuccess(100);
		monitor.recordError(); // 20% error rate = degraded (below 2x threshold)

		const metrics = monitor.calculateHealth(2, 1, 0, 0);
		expect(metrics.status).toBe("degraded");
	});

	test("should include all metrics in calculateHealth", () => {
		monitor.recordSuccess(100);

		const metrics = monitor.calculateHealth(5, 2, 3, 1);
		expect(metrics.totalWorkers).toBe(5);
		expect(metrics.idleWorkers).toBe(2);
		expect(metrics.busyWorkers).toBe(3);
		expect(metrics.queuedTasks).toBe(3);
		expect(metrics.pendingTasks).toBe(1);
		expect(metrics.averageTaskDuration).toBe(100);
	});

	test("should reset counters", () => {
		monitor.recordSuccess(100);
		monitor.recordError();

		monitor.resetCounters();

		const metrics = monitor.calculateHealth(2, 1, 0, 0);
		expect(metrics.errorRate).toBe(0);
		expect(metrics.averageTaskDuration).toBe(0);
	});

	test("should stop monitoring", () => {
		monitor.stop();
		// Should not throw or cause issues
		monitor.recordSuccess(100);
		const metrics = monitor.calculateHealth(2, 1, 0, 0);
		expect(metrics.status).toBe("healthy");
	});

	test("should limit task duration history to 100 entries", () => {
		// Add 150 task durations
		for (let i = 0; i < 150; i++) {
			monitor.recordSuccess(100);
		}

		const metrics = monitor.calculateHealth(2, 1, 0, 0);
		// Average should still be 100 (all values are 100)
		expect(metrics.averageTaskDuration).toBe(100);
	});

	test("should handle zero tasks gracefully", () => {
		const metrics = monitor.calculateHealth(2, 1, 0, 0);
		expect(metrics.averageTaskDuration).toBe(0);
		expect(metrics.errorRate).toBe(0);
	});

	test("disabled monitor should not affect functionality", () => {
		const disabledMonitor = new HealthMonitor({ enabled: false });
		disabledMonitor.recordSuccess(100);
		disabledMonitor.recordSuccess(100);
		disabledMonitor.recordSuccess(100);
		disabledMonitor.recordSuccess(100); // All success = healthy

		const metrics = disabledMonitor.calculateHealth(2, 1, 0, 0);
		expect(metrics.status).toBe("healthy");
	});
});
