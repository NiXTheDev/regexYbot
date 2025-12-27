import js from "@eslint/js";

export default [
	js.configs.recommended,
	{
		files: ["*.ts"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "module",
			globals: {
				Bun: "readonly",
				process: "readonly",
				console: "readonly",
				performance: "readonly",
				self: "readonly",
				Worker: "readonly",
			},
		},
		rules: {
			"no-console": "off",
			"no-unused-vars": "off",
			"no-undef": "error",
		},
	},
	{
		ignores: ["node_modules/", "dist/", "*.lock"],
	},
];
