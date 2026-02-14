/**
 * Circuit Breaker pattern implementation
 *
 * Prevents cascading failures by stopping requests to failing services
 * States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing)
 */
import { CircuitBreakerError } from "./errors";
import { Logger } from "./logger";

interface CircuitBreakerOptions {
	/** Number of failures before opening circuit */
	failureThreshold: number;
	/** Time in ms before attempting reset (HALF_OPEN) */
	resetTimeoutMs: number;
	/** Success threshold in HALF_OPEN to close circuit */
	successThreshold: number;
}

enum CircuitState {
	CLOSED = "CLOSED",
	OPEN = "OPEN",
	HALF_OPEN = "HALF_OPEN",
}

export class CircuitBreaker {
	private state: CircuitState = CircuitState.CLOSED;
	private failures = 0;
	private successes = 0;
	private nextAttempt = 0;
	private readonly logger: Logger;

	constructor(
		private readonly name: string,
		private readonly options: CircuitBreakerOptions = {
			failureThreshold: 5,
			resetTimeoutMs: 30000,
			successThreshold: 2,
		},
	) {
		this.logger = new Logger(`CircuitBreaker:${name}`);
	}

	/**
	 * Execute a function with circuit breaker protection
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		if (this.state === CircuitState.OPEN) {
			if (Date.now() < this.nextAttempt) {
				this.logger.debug(`Circuit open for ${this.name}, rejecting request`);
				throw new CircuitBreakerError(this.name, this.nextAttempt);
			}
			this.logger.debug(`Circuit entering HALF_OPEN for ${this.name}`);
			this.state = CircuitState.HALF_OPEN;
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			throw error;
		}
	}

	/**
	 * Record a successful operation
	 */
	private onSuccess(): void {
		this.failures = 0;

		if (this.state === CircuitState.HALF_OPEN) {
			this.successes++;
			if (this.successes >= this.options.successThreshold) {
				this.logger.info(
					`Circuit closed for ${this.name} after ${this.successes} successes`,
				);
				this.state = CircuitState.CLOSED;
				this.successes = 0;
			}
		}
	}

	/**
	 * Record a failed operation
	 */
	private onFailure(): void {
		this.failures++;
		this.successes = 0;

		if (this.failures >= this.options.failureThreshold) {
			this.logger.warn(
				`Circuit opened for ${this.name} after ${this.failures} failures`,
			);
			this.state = CircuitState.OPEN;
			this.nextAttempt = Date.now() + this.options.resetTimeoutMs;
		}
	}

	/**
	 * Get current circuit state
	 */
	getState(): string {
		return this.state;
	}

	/**
	 * Get failure count
	 */
	getFailureCount(): number {
		return this.failures;
	}

	/**
	 * Manually reset the circuit (for testing/emergencies)
	 */
	reset(): void {
		this.state = CircuitState.CLOSED;
		this.failures = 0;
		this.successes = 0;
		this.nextAttempt = 0;
		this.logger.info(`Circuit manually reset for ${this.name}`);
	}
}
