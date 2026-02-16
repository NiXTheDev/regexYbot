/**
 * Regex help module with interactive keyboard navigation
 *
 * Provides /regexhelp command with category/item selection via custom keyboards
 */

import { InlineKeyboard } from "grammy";

export interface RegexHelpItem {
	name: string;
	description: string;
	example?: string;
}

export interface RegexHelpCategory {
	name: string;
	description: string;
	items: Record<string, RegexHelpItem>;
}

// Help content organized by category
export const regexHelpData: Record<string, RegexHelpCategory> = {
	tokens: {
		name: "Tokens",
		description:
			"Special character classes that match specific types of characters",
		items: {
			d: {
				name: "\\d",
				description: "Matches any digit (0-9)",
				example: "\\d matches '5' in 'abc5def'",
			},
			D: {
				name: "\\D",
				description: "Matches any non-digit",
				example: "\\D matches 'a' in '123a456'",
			},
			w: {
				name: "\\w",
				description: "Matches any word character [a-zA-Z0-9_]",
				example: "\\w matches 'h' in 'hello'",
			},
			W: {
				name: "\\W",
				description: "Matches any non-word character",
				example: "\\W matches ' ' in 'hello world'",
			},
			s: {
				name: "\\s",
				description: "Matches any whitespace (space, tab, newline)",
				example: "\\s matches the space in 'a b'",
			},
			S: {
				name: "\\S",
				description: "Matches any non-whitespace",
				example: "\\S matches 'a' in ' a '",
			},
			dot: {
				name: ".",
				description: "Matches any character except newline",
				example: ". matches any character in 'abc'",
			},
		},
	},
	quantifiers: {
		name: "Quantifiers",
		description: "Specify how many times a pattern should match",
		items: {
			star: {
				name: "*",
				description: "Zero or more times",
				example: "a* matches '', 'a', or 'aaa'",
			},
			plus: {
				name: "+",
				description: "One or more times",
				example: "a+ matches 'a' or 'aaa' but not ''",
			},
			question: {
				name: "?",
				description: "Zero or one time (optional)",
				example: "a? matches '' or 'a'",
			},
			exact: {
				name: "{n}",
				description: "Exactly n times",
				example: "a{3} matches exactly 'aaa'",
			},
			min: {
				name: "{n,}",
				description: "At least n times",
				example: "a{2,} matches 'aa', 'aaa', etc.",
			},
			range: {
				name: "{n,m}",
				description: "Between n and m times",
				example: "a{2,4} matches 'aa', 'aaa', or 'aaaa'",
			},
		},
	},
	anchors: {
		name: "Anchors",
		description: "Match positions rather than characters",
		items: {
			start: {
				name: "^",
				description: "Start of string",
				example: "^hello matches 'hello world' but not 'say hello'",
			},
			end: {
				name: "$",
				description: "End of string",
				example: "world$ matches 'hello world' but not 'world peace'",
			},
			word: {
				name: "\\b",
				description: "Word boundary",
				example: "\\bcat\\b matches 'cat' but not 'category'",
			},
			nonword: {
				name: "\\B",
				description: "Non-word boundary",
				example: "\\Bcat matches 'category' but not 'cat'",
			},
		},
	},
	groups: {
		name: "Groups",
		description: "Group parts of patterns together",
		items: {
			capture: {
				name: "()",
				description: "Capture group - remembers match for backreferences",
				example: "(abc) captures 'abc' for use with $1",
			},
			noncapture: {
				name: "(?:)",
				description: "Non-capturing group - groups without remembering",
				example: "(?:abc) groups but doesn't capture",
			},
			lookahead: {
				name: "(?=)",
				description: "Positive lookahead - matches if followed by",
				example: "a(?=b) matches 'a' only if followed by 'b'",
			},
			neglookahead: {
				name: "(?!)",
				description: "Negative lookahead - matches if NOT followed by",
				example: "a(?!b) matches 'a' only if NOT followed by 'b'",
			},
		},
	},
	classes: {
		name: "Character Classes",
		description: "Match specific sets of characters",
		items: {
			set: {
				name: "[]",
				description: "Character set - match any character inside",
				example: "[abc] matches 'a', 'b', or 'c'",
			},
			negset: {
				name: "[^]",
				description: "Negated set - match any character NOT inside",
				example: "[^abc] matches any character except 'a', 'b', 'c'",
			},
			range: {
				name: "[a-z]",
				description: "Range - match any character in range",
				example: "[a-z] matches any lowercase letter",
			},
		},
	},
	escapes: {
		name: "Escapes",
		description: "Match special characters literally",
		items: {
			dot: {
				name: "\\.",
				description: "Literal dot",
				example: "\\. matches '.' not 'any character'",
			},
			star: {
				name: "\\*",
				description: "Literal asterisk",
				example: "\\* matches '*' not 'zero or more'",
			},
			plus: {
				name: "\\+",
				description: "Literal plus",
				example: "\\+ matches '+' not 'one or more'",
			},
			backslash: {
				name: "\\\\",
				description: "Literal backslash",
				example: "\\\\ matches a single backslash",
			},
			tab: {
				name: "\\t",
				description: "Tab character",
				example: "\\t matches a tab",
			},
			newline: {
				name: "\\n",
				description: "Newline character",
				example: "\\n matches a newline",
			},
		},
	},
	flags: {
		name: "Flags",
		description: "Modify how the regex behaves",
		items: {
			global: {
				name: "g",
				description: "Global - find all matches, not just first",
				example: "/a/g matches all 'a's in 'banana'",
			},
			ignorecase: {
				name: "i",
				description: "Ignore case - case insensitive matching",
				example: "/hello/i matches 'HELLO', 'Hello', etc.",
			},
			multiline: {
				name: "m",
				description: "Multiline - ^ and $ match line boundaries",
				example: "/^foo/m matches 'foo' at start of any line",
			},
			dotall: {
				name: "s",
				description: "Dot all - dot matches newlines too",
				example: "/.+/s matches entire multiline text",
			},
			performance: {
				name: "p",
				description: "Performance - show timing info (custom flag)",
				example: "/pattern/p shows execution time",
			},
		},
	},
};

/**
 * Create category selection keyboard
 */
export function createCategoryKeyboard(): InlineKeyboard {
	const keyboard = new InlineKeyboard();

	const categories = Object.entries(regexHelpData);
	for (let i = 0; i < categories.length; i += 2) {
		const row = categories.slice(i, i + 2);
		keyboard.row(
			...row.map(([key, data]) =>
				InlineKeyboard.text(data.name, `regexhelp:category:${key}`),
			),
		);
	}

	return keyboard;
}

/**
 * Create item selection keyboard for a category
 */
export function createItemKeyboard(categoryKey: string): InlineKeyboard {
	const keyboard = new InlineKeyboard();
	const category = regexHelpData[categoryKey];

	if (!category) {
		return keyboard.text("Back", "regexhelp:back");
	}

	const items = Object.entries(category.items);
	for (let i = 0; i < items.length; i += 3) {
		const row = items.slice(i, i + 3);
		keyboard.row(
			...row.map(([key, item]) =>
				InlineKeyboard.text(item.name, `regexhelp:item:${categoryKey}:${key}`),
			),
		);
	}

	keyboard.row(InlineKeyboard.text("Back to Categories", "regexhelp:back"));

	return keyboard;
}

/**
 * Format item details for display
 */
export function formatItemHelp(
	categoryKey: string,
	itemKey: string,
): string | null {
	const category = regexHelpData[categoryKey];
	if (!category) return null;

	const item = category.items[itemKey];
	if (!item) return null;

	let message = `**${item.name}**\n\n`;
	message += `${item.description}\n\n`;
	if (item.example) {
		message += `Example: ${item.example}`;
	}

	return message;
}

/**
 * Format category overview for display
 */
export function formatCategoryHelp(categoryKey: string): string | null {
	const category = regexHelpData[categoryKey];
	if (!category) return null;

	let message = `**${category.name}**\n\n`;
	message += `${category.description}\n\n`;
	message += `Available items:\n`;

	for (const item of Object.values(category.items)) {
		message += `- ${item.name}: ${item.description}\n`;
	}

	return message;
}

/**
 * Get main help message
 */
export function getMainHelpMessage(): string {
	return (
		"**Regex Help**\n\n" +
		"Select a category to learn about regex syntax:\n\n" +
		Object.values(regexHelpData)
			.map((cat) => `- **${cat.name}**: ${cat.description}`)
			.join("\n")
	);
}
