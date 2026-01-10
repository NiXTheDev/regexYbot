import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["*.js"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				Bun: "readonly",
				process: "readonly",
				console: "readonly",
			},
		},
		rules: {
			"no-console": "off",
		},
	},
	{
		files: ["*.ts", "*.tsx"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				Bun: "readonly",
				process: "readonly",
				console: "readonly",
			},
			parserOptions: {
				project: "./tsconfig.json",
			},
		},
		rules: {
			"no-console": "off",
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_" },
			],
		},
	},
	{
		files: ["*.yml", "*.yaml"],
		rules: {},
	},
	{
		ignores: ["node_modules/", "dist/", "*.lock"],
	},
];
