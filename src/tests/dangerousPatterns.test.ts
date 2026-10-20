import { describe, test, expect } from "bun:test";
import {
	analyzePatternComplexity,
	detectDangerousPattern,
	formatDangerousPatternWarning,
} from "../dangerousPatterns";

describe("analyzePatternComplexity", () => {
	test("classifies trivial patterns as simple", () => {
		expect(analyzePatternComplexity("a")).toEqual({
			score: 0,
			level: "simple",
		});
	});

	test("classifies nested-quantifier patterns as complex", () => {
		const result = analyzePatternComplexity("(a+)+$");
		expect(result.level).toBe("complex");
		expect(result.score).toBeGreaterThan(0);
	});

	test("warning text includes the complexity tier and risk score", () => {
		const detected = detectDangerousPattern("(a+)+$");
		expect(detected.detected).toBe(true);
		const warning = formatDangerousPatternWarning(detected);
		expect(warning).toContain("Complexity: complex");
		expect(warning).toContain(`(risk score: ${detected.complexityScore}/100)`);
	});

	test("non-detected patterns format to an empty warning", () => {
		const detected = detectDangerousPattern("a");
		expect(detected.detected).toBe(false);
		expect(formatDangerousPatternWarning(detected)).toBe("");
	});
});
