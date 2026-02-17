# English translations (default)

## Errors
error-rateLimit = Rate limit exceeded. Please wait { $seconds } seconds.
error-invalidRegex = Invalid regex pattern. Check your syntax and try again.
error-telegramAPI = Something went wrong. Please try again.
error-workerTimeout = Processing error. Please try again with a simpler pattern.
error-circuitOpen = Service temporarily unavailable. Please try again later.
error-noTarget = No matching target found in recent messages.
error-targetIsCommand = Cannot substitute on another sed command.
error-messageTooLong = Result is too long ({ $length }/{ $max } characters).
error-chainTooLong = Too many commands in chain (max { $max }).

## Commands
command-start = Hello! I am a regex bot. Use s/find/replace/flags to substitute text in messages. The replacement text can span multiple lines or use escape sequences like `\n`. You can also chain multiple commands, one per line.

    Special flags:
    - `p`: Show performance timing
    Use `\N` for captured groups.

command-privacy = This bot does not collect or process any user data, apart from a short backlog of messages to perform regex substitutions on. These are stored in an in-memory sql db for 48h, and can not be accessed by the bot's administrator in any way.

command-language-usage = Usage:
    /language - Show current language
    /language list - Show available languages
    /language set <code> - Change language

command-language-current = Your current language is: { $language }
command-language-list = Available languages:

    { $languages }

    Use /language set <code> to change.
command-language-setSuccess = Language changed to { $language }
command-language-setError = Invalid language code. Use /language list to see available options.

## Substitution results
substitution-result = Result: { $result }
substitution-noMatch = No match found.
substitution-multipleResults = Applied { $count } substitutions
substitution-performance = Performed { $count } substitutions in { $time }

## Tips
tip-optimization = Tip: { $suggestion }
tip-useShorthand = Use { $shorthand } instead of { $longform } (shorter)
tip-nonCapturing = Use (?:...) for groups you don't reference
tip-greedy = Consider using .*? instead of .* (non-greedy)

## Regex Help
regexHelp-title = Regex Help
regexHelp-selectCategory = Select a category to learn about regex syntax:
regexHelp-back = Back
regexHelp-backToCategories = Back to Categories

## Health & Metrics
health-title = Bot Health Status
health-healthy = HEALTHY
health-degraded = DEGRADED
health-unhealthy = UNHEALTHY
health-workers = Workers: { $active } active, { $idle } idle
health-queue = Queue: { $pending } pending tasks
health-errorRate = Error Rate: { $rate }%
health-uptime = Uptime: { $uptime }

metrics-title = Performance Metrics
metrics-cacheHitRate = Cache Hit Rate: { $rate }%
metrics-avgProcessingTime = Avg Processing Time: { $time }ms
metrics-totalSubstitutions = Total Substitutions: { $count }
metrics-regexCompilations = Regex Compilations: { $total } (cached: { $cached })

## General
general-yes = Yes
general-no = No
general-cancel = Cancel
general-done = Done
general-loading = Loading...
general-error = Error
