import { describe, test, expect } from "bun:test";
import { parseSedCommands } from "../sed";

describe("parseSedCommands", () => {
	describe("basic command parsing", () => {
		test("should parse simple sed command", () => {
			const text = "s/foo/bar/";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/foo/bar/"]);
		});

		test("should parse sed command with flags", () => {
			const text = "s/foo/bar/gi";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/foo/bar/gi"]);
		});

		test("should parse multiple sed commands", () => {
			const text = "s/foo/bar/\ns/baz/qux/g";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/foo/bar/", "s/baz/qux/g"]);
		});

		test("should return empty array for text without sed commands", () => {
			const text = "hello world";
			const commands = parseSedCommands(text);
			expect(commands).toEqual([]);
		});

		test("should handle empty string", () => {
			const commands = parseSedCommands("");
			expect(commands).toEqual([]);
		});
	});

	describe("multi-line replacements", () => {
		test("should parse multi-line replacement", () => {
			const text = `s/start/end
with multiple
lines here/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(1);
			expect(commands[0]).toBe(`s/start/end\nwith multiple\nlines here/`);
		});

		test("should parse multiple commands with multi-line replacements", () => {
			const text = `s/first/replacement
on multiple
lines/
s/second/single/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(2);
			expect(commands[0]).toBe(`s/first/replacement\non multiple\nlines/`);
			expect(commands[1]).toBe("s/second/single/");
		});

		test("should handle mixed content with multi-line", () => {
			const text = `some text here
s/pattern/replacement
spanning multiple
lines/
more text
s/another/pattern/g`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(2);
			// Lines after the command but before next command are included in replacement
			expect(commands[0]).toBe(
				`s/pattern/replacement\nspanning multiple\nlines/\nmore text`,
			);
			expect(commands[1]).toBe("s/another/pattern/g");
		});

		test("should handle multi-line with indentation", () => {
			const text = `s/start/replacement
  indented line
    more indented/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(1);
			expect(commands[0]).toContain("  indented line");
		});

		test("should handle complex multi-line replacement", () => {
			const text = `s/old/complex
multi-line
replacement with
special chars: @#$%/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(1);
			expect(commands[0]).toContain("special chars: @#$%");
		});
	});

	describe("tricky inputs", () => {
		test("should handle sed command with escaped slashes", () => {
			const text = "s/foo\\/bar/baz/";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/foo\\/bar/baz/"]);
		});

		test("should handle command with only whitespace before", () => {
			const text = "   s/foo/bar/";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/foo/bar/"]);
		});

		test("should not treat lines starting with s/ inside text as new commands", () => {
			const text = `s/start/middle
this is not a s/new/command/
s/actual/new command/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(2);
			expect(commands[0]).toContain("this is not a s/new/command/");
			expect(commands[1]).toBe("s/actual/new command/");
		});

		test("should handle command with trailing whitespace", () => {
			const text = "s/foo/bar/   ";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/foo/bar/"]);
		});

		test("should handle multiple empty lines between commands", () => {
			const text = `s/first/second/


s/third/fourth/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(2);
		});

		test("should handle tab characters before command", () => {
			const text = "\ts/foo/bar/";
			const commands = parseSedCommands(text);
			// Tab is whitespace, so it should be trimmed and recognized
			expect(commands).toEqual(["s/foo/bar/"]);
		});

		test("should handle command in the middle of text", () => {
			const text = `hello world
s/foo/bar/
goodbye world`;
			const commands = parseSedCommands(text);
			// Lines after the command are included until a new command is found
			expect(commands).toEqual(["s/foo/bar/\ngoodbye world"]);
		});

		test("should handle unicode characters in replacement", () => {
			const text = "s/hello/🎉 celebration 🎉/";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/hello/🎉 celebration 🎉/"]);
		});

		test("should handle regex special characters in pattern", () => {
			const text = "s/[a-z]+/$1/g";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/[a-z]+/$1/g"]);
		});
	});

	describe("edge cases", () => {
		test("should handle single line with just s/", () => {
			const text = "s/";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/"]);
		});

		test("should handle multiple consecutive sed commands", () => {
			const text = "s/a/b/\ns/c/d/\ns/e/f/\ns/g/h/";
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(4);
		});

		test("should preserve complex patterns", () => {
			const text = "s/([a-z]+)/$1/gi";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/([a-z]+)/$1/gi"]);
		});

		test("should handle empty replacement part", () => {
			const text = "s/foo//";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/foo//"]);
		});

		test("should handle only newlines", () => {
			const text = "\n\n\n";
			const commands = parseSedCommands(text);
			expect(commands).toEqual([]);
		});

		test("should handle very long command", () => {
			const longText = "a".repeat(1000);
			const text = `s/${longText}/replacement/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(1);
			expect(commands[0]).toContain(longText);
		});

		test("should handle nested slashes", () => {
			// eslint-disable-next-line no-useless-escape
			const text = "s/http:\/\/example.com/https:\/\/secure.example.com/";
			const commands = parseSedCommands(text);
			expect(commands).toEqual([
				// eslint-disable-next-line no-useless-escape
				"s/http:\/\/example.com/https:\/\/secure.example.com/",
			]);
		});
	});

	describe("complex real-world scenarios", () => {
		test("should handle URL replacement", () => {
			// eslint-disable-next-line no-useless-escape
			const text = "s/http:\/\/old.com/http:\/\/new.com/g";
			const commands = parseSedCommands(text);
			// eslint-disable-next-line no-useless-escape
			expect(commands).toEqual(["s/http:\/\/old.com/http:\/\/new.com/g"]);
		});

		test("should handle code block replacement", () => {
			const text = `s/oldFunction/newFunction
const result = newFunction(args)
return result/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(1);
			expect(commands[0]).toContain("const result");
		});

		test("should handle markdown formatting replacement", () => {
			const text = `s/old text/new **bold** and *italic* text
with multiple
lines of markdown/`;
			const commands = parseSedCommands(text);
			expect(commands).toHaveLength(1);
			expect(commands[0]).toContain("**bold**");
		});

		test("should handle capture groups", () => {
			const text = "s/(\\w+) (\\w+)/$2, $1/";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/(\\w+) (\\w+)/$2, $1/"]);
		});

		test("should handle word boundaries", () => {
			const text = "s/\\bword\\b/replacement/g";
			const commands = parseSedCommands(text);
			expect(commands).toEqual(["s/\\bword\\b/replacement/g"]);
		});
	});
});
