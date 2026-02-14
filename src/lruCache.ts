/**
 * LRU (Least Recently Used) Cache implementation with TTL support
 *
 * Stores items with a max size limit and optional time-to-live.
 * When limit is reached, least recently accessed items are removed.
 * Expired items are automatically removed on access.
 */
interface CacheEntry<V> {
	value: V;
	expiresAt: number | null; // null means no expiration
}

export class LRUCache<K, V> {
	private cache: Map<K, CacheEntry<V>>;
	private maxSize: number;
	private defaultTTL: number | null;

	/**
	 * @param maxSize - Maximum number of items in cache
	 * @param defaultTTL - Default TTL in milliseconds (null for no expiration)
	 */
	constructor(maxSize: number, defaultTTL: number | null = null) {
		this.cache = new Map();
		this.maxSize = maxSize;
		this.defaultTTL = defaultTTL;
	}

	/**
	 * Get value from cache
	 * Moves item to end (most recently used)
	 * Returns undefined if expired or not found
	 */
	get(key: K): V | undefined {
		const entry = this.cache.get(key);
		if (entry === undefined) {
			return undefined;
		}

		// Check if expired
		if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return undefined;
		}

		// Move to end (most recently used)
		this.cache.delete(key);
		this.cache.set(key, entry);
		return entry.value;
	}

	/**
	 * Set value in cache
	 * Removes least recently used items if over max size
	 * @param ttl - Optional TTL override in milliseconds (null for no expiration)
	 */
	set(key: K, value: V, ttl?: number | null): void {
		// Determine expiration time
		let expiresAt: number | null = null;
		const effectiveTTL = ttl !== undefined ? ttl : this.defaultTTL;
		if (effectiveTTL !== null && effectiveTTL > 0) {
			expiresAt = Date.now() + effectiveTTL;
		}

		if (this.cache.has(key)) {
			this.cache.delete(key);
		}

		this.cache.set(key, { value, expiresAt });

		// Remove least recently used if over max size
		if (this.cache.size > this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
	}

	/**
	 * Check if key exists in cache and is not expired
	 */
	has(key: K): boolean {
		const entry = this.cache.get(key);
		if (entry === undefined) {
			return false;
		}

		// Check if expired
		if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * Get current cache size (including expired items)
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		size: number;
		maxSize: number;
		defaultTTL: number | null;
	} {
		return {
			size: this.cache.size,
			maxSize: this.maxSize,
			defaultTTL: this.defaultTTL,
		};
	}

	/**
	 * Clear all entries
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Remove expired entries (can be called periodically for cleanup)
	 * @returns Number of entries removed
	 */
	cleanup(): number {
		const now = Date.now();
		let removed = 0;
		for (const [key, entry] of this.cache) {
			if (entry.expiresAt !== null && now > entry.expiresAt) {
				this.cache.delete(key);
				removed++;
			}
		}
		return removed;
	}
}
