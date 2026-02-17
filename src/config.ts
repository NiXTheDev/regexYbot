/**
 * Centralized configuration module for regexYbot.
 * All environment variables are read and validated here.
 *
 * NOTE: This module should not import Logger to avoid circular dependencies.
 * Use console.warn for validation warnings during config loading.
 */

// Log levels in order of severity
const VALID_LOG_LEVELS = [
	"none",
	"debug",
	"info",
	"warn",
	"error",
	"fatal",
] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

/**
 * Configuration interface defining all available options.
 */
export interface BotConfig {
	// Required
	readonly TOKEN: string;

	// Telegram API
	readonly BASE_URL: string;

	// Logging
	readonly LOG_LEVEL: LogLevel;
	readonly LOG_TEMPLATE: string;
	readonly NODE_ENV: "development" | "production" | "test";

	// Worker Pool (Dynamic Scaling)
	readonly WORKER_TIMEOUT_MS: number;
	readonly WORKER_POOL_MIN_WORKERS: number;
	readonly WORKER_POOL_MAX_WORKERS: number;
	readonly WORKER_POOL_INITIAL_WORKERS: number;
	readonly WORKER_POOL_IDLE_TIMEOUT_MS: number;
	readonly WORKER_POOL_IDLE_CHECK_INTERVAL_MS: number;

	// Graceful Shutdown
	readonly GRACEFUL_DRAIN: boolean;
	readonly GRACEFUL_DRAIN_TIMEOUT_MS: number;

	// Rate Limiting
	readonly RATE_LIMIT_ENABLED: boolean;
	readonly RATE_LIMIT_COMMANDS_PER_MINUTE: number;

	// Caching
	readonly CACHE_ENABLED: boolean;
	readonly CACHE_MAX_SIZE: number;
	readonly CACHE_TTL_MS: number;

	// Message Processing
	readonly MAX_CHAIN_LENGTH: number;
	readonly MAX_MESSAGE_LENGTH: number;

	// Database / History
	readonly CLEANUP_INTERVAL_MS: number;
	readonly MAX_HISTORY_PER_CHAT: number;
	readonly HISTORY_QUERY_LIMIT: number;

	// Retry Configuration
	readonly RETRY_MAX_RETRIES: number;
	readonly RETRY_MAX_DELAY_MS: number;

	// Healthcheck
	readonly ENABLE_FILE_HEALTHCHECK: boolean;
	readonly LIVENESS_FILE: string;
	readonly LIVENESS_INTERVAL_MS: number;
}

/**
 * Helper function to parse integer env vars with validation.
 */
function parseIntEnv(
	key: string,
	defaultValue: number,
	minValue?: number,
	maxValue?: number,
): number {
	const raw = process.env[key];
	if (!raw) return defaultValue;

	const parsed = parseInt(raw, 10);
	if (isNaN(parsed)) {
		console.warn(
			`[Config]: Invalid value for ${key}: "${raw}". Using default: ${defaultValue}`,
		);
		return defaultValue;
	}

	if (minValue !== undefined && parsed < minValue) {
		console.warn(
			`[Config]: ${key} value ${parsed} is below minimum ${minValue}. Using minimum.`,
		);
		return minValue;
	}

	if (maxValue !== undefined && parsed > maxValue) {
		console.warn(
			`[Config]: ${key} value ${parsed} is above maximum ${maxValue}. Using maximum.`,
		);
		return maxValue;
	}

	return parsed;
}

/**
 * Helper function to parse boolean env vars.
 */
function parseBoolEnv(key: string, defaultValue: boolean): boolean {
	const raw = process.env[key]?.toLowerCase();
	if (!raw) return defaultValue;

	if (raw === "true" || raw === "1" || raw === "yes") return true;
	if (raw === "false" || raw === "0" || raw === "no") return false;

	console.warn(
		`[Config]: Invalid boolean value for ${key}: "${raw}". Using default: ${defaultValue}`,
	);
	return defaultValue;
}

/**
 * Helper function to parse string env vars with optional validation.
 */
function parseStringEnv(key: string, defaultValue: string): string {
	const raw = process.env[key];
	if (!raw) return defaultValue;
	return raw.trim();
}

/**
 * Helper function to parse and validate log level.
 */
function parseLogLevel(): LogLevel {
	const raw = process.env.LOG_LEVEL?.toLowerCase();
	if (!raw) {
		// Default based on NODE_ENV
		return process.env.NODE_ENV === "production" ? "info" : "debug";
	}

	if (VALID_LOG_LEVELS.includes(raw as LogLevel)) {
		return raw as LogLevel;
	}

	console.warn(
		`[Config]: Invalid LOG_LEVEL: "${raw}". Valid levels: ${VALID_LOG_LEVELS.join(", ")}. Using default.`,
	);
	return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Helper function to parse NODE_ENV.
 */
function parseNodeEnv(): "development" | "production" | "test" {
	const raw = process.env.NODE_ENV?.toLowerCase();
	if (!raw) return "development";

	if (raw === "production" || raw === "test" || raw === "development") {
		return raw;
	}

	console.warn(
		`[Config]: Invalid NODE_ENV: "${raw}". Using default: development`,
	);
	return "development";
}

/**
 * Load and validate all configuration.
 * This function should be called once at startup.
 */
function loadConfig(): BotConfig {
	// Parse NODE_ENV first as it affects other defaults
	const nodeEnv = parseNodeEnv();

	// Required: TOKEN (but not in test environment)
	const token = process.env.TOKEN;
	if (!token && nodeEnv !== "test") {
		console.error(
			"[Config]: FATAL - TOKEN environment variable is required but not set.",
		);
		process.exit(1);
	}

	const config: BotConfig = {
		// Required (use empty string in test mode if not provided)
		TOKEN: token || "test-token",

		// Telegram API
		BASE_URL: parseStringEnv("BASE_URL", "https://api.telegram.org"),

		// Logging
		LOG_LEVEL: parseLogLevel(),
		LOG_TEMPLATE: parseStringEnv(
			"LOG_TEMPLATE",
			"[{level}: {module}]: {message}",
		),
		NODE_ENV: nodeEnv,

		// Worker Pool (Dynamic Scaling)
		WORKER_TIMEOUT_MS: parseIntEnv(
			"WORKER_TIMEOUT_MS",
			60 * 1000,
			1000,
			300 * 1000,
		),
		WORKER_POOL_MIN_WORKERS: parseIntEnv("WORKER_POOL_MIN_WORKERS", 0, 0),
		WORKER_POOL_MAX_WORKERS: parseIntEnv("WORKER_POOL_MAX_WORKERS", 8, 1, 32),
		WORKER_POOL_INITIAL_WORKERS: parseIntEnv(
			"WORKER_POOL_INITIAL_WORKERS",
			1,
			0,
		),
		WORKER_POOL_IDLE_TIMEOUT_MS: parseIntEnv(
			"WORKER_POOL_IDLE_TIMEOUT_MS",
			15 * 60 * 1000,
			60 * 1000,
		),
		WORKER_POOL_IDLE_CHECK_INTERVAL_MS: parseIntEnv(
			"WORKER_POOL_IDLE_CHECK_INTERVAL_MS",
			5 * 60 * 1000,
			10 * 1000,
			15 * 60 * 1000,
		),

		// Graceful Shutdown
		GRACEFUL_DRAIN: parseBoolEnv("GRACEFUL_DRAIN", false),
		GRACEFUL_DRAIN_TIMEOUT_MS: parseIntEnv(
			"GRACEFUL_DRAIN_TIMEOUT_MS",
			8000,
			1000,
			9500, // Max 9.5s to fit in Docker's 10s grace period
		),

		// Rate Limiting
		RATE_LIMIT_ENABLED: parseBoolEnv("RATE_LIMIT_ENABLED", true),
		RATE_LIMIT_COMMANDS_PER_MINUTE: parseIntEnv(
			"RATE_LIMIT_COMMANDS_PER_MINUTE",
			30,
			1,
			300,
		),

		// Caching
		CACHE_ENABLED: parseBoolEnv("CACHE_ENABLED", true),
		CACHE_MAX_SIZE: parseIntEnv("CACHE_MAX_SIZE", 1000, 100, 10000),
		CACHE_TTL_MS: parseIntEnv("CACHE_TTL_MS", 300000, 60000, 600000),

		// Message Processing
		MAX_CHAIN_LENGTH: parseIntEnv("MAX_CHAIN_LENGTH", 5, 1, 50),
		MAX_MESSAGE_LENGTH: parseIntEnv("MAX_MESSAGE_LENGTH", 4096, 100, 10000),

		// Database / History
		CLEANUP_INTERVAL_MS: parseIntEnv(
			"CLEANUP_INTERVAL_MS",
			48 * 60 * 60 * 1000,
			60 * 60 * 1000,
			7 * 24 * 60 * 60 * 1000,
		),
		MAX_HISTORY_PER_CHAT: parseIntEnv("MAX_HISTORY_PER_CHAT", 20, 5, 200),
		HISTORY_QUERY_LIMIT: parseIntEnv("HISTORY_QUERY_LIMIT", 10, 1, 100),

		// Retry Configuration
		RETRY_MAX_RETRIES: parseIntEnv("RETRY_MAX_RETRIES", 3, 0, 10),
		RETRY_MAX_DELAY_MS: parseIntEnv("RETRY_MAX_DELAY_MS", 30000, 1000, 300000),

		// Healthcheck
		ENABLE_FILE_HEALTHCHECK: parseBoolEnv("ENABLE_FILE_HEALTHCHECK", false),
		LIVENESS_FILE: parseStringEnv("LIVENESS_FILE", "/tmp/bot-alive"),
		LIVENESS_INTERVAL_MS: parseIntEnv(
			"LIVENESS_INTERVAL_MS",
			30000,
			5000,
			300000,
		),
	};

	// Log configuration summary (only in non-production to avoid leaking sensitive data)
	if (config.NODE_ENV === "development") {
		console.log("[Config]: Configuration loaded successfully");
	}

	return config;
}

/**
 * The global configuration object.
 * This is frozen to prevent accidental mutations.
 */
export const CONFIG: BotConfig = Object.freeze(loadConfig());

/**
 * Derived configuration values that don't need env vars.
 */
export const DERIVED = {
	/** Cleanup interval in hours (for display/logging) */
	get CLEANUP_HOURS(): number {
		return CONFIG.CLEANUP_INTERVAL_MS / (60 * 60 * 1000);
	},
} as const;

/**
 * Helper to check if a specific log level is enabled.
 */
export function isLogLevelEnabled(level: LogLevel): boolean {
	if (CONFIG.LOG_LEVEL === "none") return false;
	const levels = VALID_LOG_LEVELS.slice(1); // Exclude "none"
	const currentIndex = levels.indexOf(CONFIG.LOG_LEVEL);
	const checkIndex = levels.indexOf(level);
	return checkIndex >= currentIndex;
}
