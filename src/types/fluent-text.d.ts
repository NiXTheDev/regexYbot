/**
 * Ambient declaration for Fluent translation files imported as inline
 * text: `import x from "./locales/en.ftl" with { type: "text" }`.
 *
 * Bun reads the file relative to the importing module during `bun run`
 * and embeds it into `bun build --compile` binaries; TypeScript only
 * needs to know the resulting value is a string.
 */
declare module "*.ftl" {
	const content: string;
	export default content;
}
