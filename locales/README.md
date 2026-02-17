# Localization (i18n)

This directory contains translation files for regexYbot using the [Fluent](https://projectfluent.org/) format.

## Supported Languages

| Code | Language             | Native Name | Status                |
| ---- | -------------------- | ----------- | --------------------- |
| en   | English              | English     | ✅ Complete (default) |
| de   | German               | Deutsch     | ✅ Complete           |
| es   | Spanish              | Español     | ✅ Complete           |
| it   | Italian              | Italiano    | ✅ Complete           |
| pl   | Polish               | Polski      | ✅ Complete           |
| sv   | Swedish              | Svenska     | ✅ Complete           |
| ru   | Russian              | Русский     | ✅ Complete           |
| uk   | Ukrainian            | Українська  | ✅ Complete           |
| ja   | Japanese             | 日本語      | ✅ Complete           |
| ko   | Korean               | 한국어      | ✅ Complete           |
| zh   | Chinese (Simplified) | 简体中文    | ✅ Complete           |

## File Structure

Each language has its own `.ftl` file named with the language code:

- `en.ftl` - English (source of truth)
- `de.ftl` - German
- `es.ftl` - Spanish
- etc.

## Contributing Translations

### Adding a New Language

1. Copy `en.ftl` to a new file named `<language-code>.ftl`
2. Replace all English text with translations
3. Add the language to `src/i18n.ts` in the `AVAILABLE_LANGUAGES` array
4. Test the translations by running the bot

### Improving Existing Translations

1. Edit the relevant `.ftl` file
2. Test your changes
3. Submit a PR following our [CONTRIBUTING.md](../CONTRIBUTING.md)

## Fluent Format Guide

### Simple Messages

```fluent
key = Translated text here
```

### Variables

```fluent
welcome = Hello, { $name }!
```

### Selectors (for plurals, gender, etc.)

```fluent
items-count = { $count ->
    [0] No items
    [one] One item
    *[other] { $count } items
}
```

### Terms (reusable snippets)

```fluent
-brand-name = regexYbot

about = About { -brand-name }
```

## Translation Keys

All translation keys follow a consistent naming pattern:

- `errors.*` - Error messages
- `commands.*` - Command responses (/start, /privacy, etc.)
- `substitution.*` - Substitution results
- `tips.*` - Optimization tips
- `regexHelp.*` - Regex help system
- `health.*` - Health check output
- `metrics.*` - Performance metrics
- `general.*` - General UI strings

## Quality Guidelines

- Keep translations natural and idiomatic
- Don't translate code examples or regex patterns
- Maintain the same tone as English (friendly, helpful)
- Test special characters display correctly
- Ensure placeholders `{ $variable }` are preserved

## Notes

- The bot automatically detects user's language from Telegram settings
- Users can override with `/language set <code>`
- Missing translations fall back to English
- All translations are loaded at startup

## Questions?

Open an issue or ask in our discussions. Native speaker reviews are always welcome!
