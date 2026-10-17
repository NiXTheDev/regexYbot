/**
 * Minimal in-memory session middleware.
 *
 * grammY v2 no longer ships the `session` plugin, but @grammyjs/i18n v1 still
 * needs `ctx.session.__language_code` to remember a language choice between
 * updates. This reimplements just enough of the v1 plugin for that:
 *
 * - data lives in an in-memory `Map` (v1's default `MemorySessionStorage`)
 * - sessions are keyed per chat, matching v1's default `getSessionKey`
 *   (`ctx.chatId`)
 * - `initial()` supplies the value for a chat that has no session yet
 * - `ctx.session` is written back once the middleware chain finishes, so a
 *   handler may also reassign it and the new value is kept
 *
 * Unlike v1 it never throws when an update has no chat; such sessions simply
 * are not persisted.
 */

import type { Context, MiddlewareFn } from "grammy";

/**
 * Session flavor, mirroring grammY v1's `SessionFlavor`.
 */
export interface SessionFlavor<S> {
	session: S;
}

/**
 * Creates a middleware that provides an in-memory, per-chat `ctx.session`.
 *
 * @param initial Produces the initial session data for a chat that has none.
 */
export function session<S extends object>(
	initial: () => S,
): MiddlewareFn<Context & SessionFlavor<S>> {
	const storage = new Map<string, S>();

	return async (ctx, next) => {
		const key = ctx.chatId?.toString();
		const stored = key === undefined ? undefined : storage.get(key);

		ctx.session = stored ?? initial();

		await next();

		if (key !== undefined) {
			storage.set(key, ctx.session);
		}
	};
}
