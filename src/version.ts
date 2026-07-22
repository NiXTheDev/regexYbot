/**
 * Version information for regexYbot
 * Updated on each release
 */

export const VERSION = "0.2.2";
export const COMMIT = "068161b";
export const RELEASED_AT = "2026-07-20";
export const CHANGES = `- grammY upgrade from v1.40.0 to v1.45.1
- Rich Messages API (replaces MarkdownV2)
- Ephemeral messages for tips, /regexhelp, /explain, warnings
- Fixed optimization tips false positive (\\, \\S, \\f, \\v no longer flagged)
- Per-escape tips with specific pattern/reason
- Capturing groups warning suppressed when all groups used in replacement`;
