/**
 * Simple LRU (Least Recently Used) Cache implementation
 *
 * Stores items with a max size limit. When limit is reached,
 * least recently accessed items are removed.
 */
export class LRUCache<K, V> {
	private cache: Map<K, V>;
	private maxSize: number;

	constructor(maxSize: number) {
		this.cache = new Map();
		this.maxSize = maxSize;
	}

	/**
	 * Get value from cache
	 * Moves item to end (most recently used)
	 */
	get(key: K): V | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			// Move to end (most recently used)
			this.cache.delete(key);
			this.cache.set(key, value);
		}
		return value;
	}

	/**
	 * Set value in cache
	 * Removes least recently used items if over max size
	 */
	set(key: K, value: V): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		}

		this.cache.set(key, value);

		// Remove least recently used if over max size
		if (this.cache.size > this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
	}

	/**
	 * Check if key exists in cache
	 */
	has(key: K): boolean {
		return this.cache.has(key);
	}

	/**
	 * Get current cache size
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Clear all entries
	 */
	clear(): void {
		this.cache.clear();
	}
}
