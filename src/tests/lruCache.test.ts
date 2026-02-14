import { describe, test, expect } from "bun:test";
import { LRUCache } from "../lruCache";

describe("LRUCache", () => {
	test("should store and retrieve values", () => {
		const cache = new LRUCache<string, number>(3);
		cache.set("a", 1);
		cache.set("b", 2);

		expect(cache.get("a")).toBe(1);
		expect(cache.get("b")).toBe(2);
	});

	test("should return undefined for non-existent keys", () => {
		const cache = new LRUCache<string, number>(3);
		expect(cache.get("nonexistent")).toBeUndefined();
	});

	test("should evict least recently used when over capacity", () => {
		const cache = new LRUCache<string, number>(2);
		cache.set("a", 1);
		cache.set("b", 2);
		cache.set("c", 3); // Should evict "a"

		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe(2);
		expect(cache.get("c")).toBe(3);
	});

	test("should update access order on get", () => {
		const cache = new LRUCache<string, number>(2);
		cache.set("a", 1);
		cache.set("b", 2);
		cache.get("a"); // "a" is now most recently used
		cache.set("c", 3); // Should evict "b", not "a"

		expect(cache.get("a")).toBe(1);
		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("c")).toBe(3);
	});

	test("should update value for existing key", () => {
		const cache = new LRUCache<string, number>(3);
		cache.set("a", 1);
		cache.set("a", 10);

		expect(cache.get("a")).toBe(10);
		expect(cache.size).toBe(1);
	});

	test("should report correct size", () => {
		const cache = new LRUCache<string, number>(5);
		expect(cache.size).toBe(0);

		cache.set("a", 1);
		cache.set("b", 2);
		expect(cache.size).toBe(2);

		cache.set("c", 3);
		expect(cache.size).toBe(3);
	});

	test("should clear all entries", () => {
		const cache = new LRUCache<string, number>(3);
		cache.set("a", 1);
		cache.set("b", 2);
		cache.clear();

		expect(cache.size).toBe(0);
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBeUndefined();
	});

	test("should check existence with has", () => {
		const cache = new LRUCache<string, number>(3);
		cache.set("a", 1);

		expect(cache.has("a")).toBe(true);
		expect(cache.has("b")).toBe(false);
	});

	test("should handle different types", () => {
		const cache = new LRUCache<number, string>(3);
		cache.set(1, "one");
		cache.set(2, "two");

		expect(cache.get(1)).toBe("one");
		expect(cache.get(2)).toBe("two");
	});
});
