import js from "@eslint/js";

export default [
	js.configs.recommended,
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
		files: ["*.yml", "*.yaml"],
		rules: {},
	},
	{
		ignores: ["node_modules/", "dist/", "*.lock", "*.ts"],
	},
];
