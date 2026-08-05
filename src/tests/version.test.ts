import { describe, test, expect } from "bun:test";
import { VERSION, COMMIT, RELEASED_AT, CHANGES } from "../version";
import { readFileSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = join(import.meta.dir, "../..");

describe("version", () => {
	describe("module exports", () => {
		test("should export VERSION as a non-empty string", () => {
			expect(typeof VERSION).toBe("string");
			expect(VERSION.length).toBeGreaterThan(0);
		});

		test("should export COMMIT as a non-empty string", () => {
			expect(typeof COMMIT).toBe("string");
			expect(COMMIT.length).toBeGreaterThan(0);
		});

		test("should export RELEASED_AT as a non-empty string", () => {
			expect(typeof RELEASED_AT).toBe("string");
			expect(RELEASED_AT.length).toBeGreaterThan(0);
		});

		test("should export CHANGES as a string or null", () => {
			expect(CHANGES === null || typeof CHANGES === "string").toBe(true);
		});

		test("VERSION should match semver format (X.Y.Z, X.Y.Z.W, or pre-release suffix)", () => {
			expect(VERSION).toMatch(/^\d+\.\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$/);
		});

		test("VERSION should match package.json version", () => {
			const pkg = JSON.parse(
				readFileSync(join(PROJECT_ROOT, "package.json"), "utf-8"),
			);
			expect(VERSION).toBe(pkg.version);
		});

		test("RELEASED_AT should match YYYY-MM-DD format", () => {
			expect(RELEASED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});
	});
});
