import { describe, test, expect } from "bun:test";
import type { Context, MiddlewareFn, NextFunction } from "grammy";
import { session, type SessionFlavor } from "../session";
import type { SessionData } from "../i18n";

type SessionContext = Context & SessionFlavor<SessionData>;

function makeMiddleware(): MiddlewareFn<SessionContext> {
	return session<SessionData>(() => ({}));
}

/** Simulates one update and returns the context the middleware populated. */
async function runUpdate(
	middleware: MiddlewareFn<SessionContext>,
	chatId: number | undefined,
	handle: (ctx: SessionContext) => void = () => {},
): Promise<SessionContext> {
	const ctx = { chatId } as unknown as SessionContext;
	const next: NextFunction = async () => {
		handle(ctx);
	};
	await middleware(ctx, next);
	return ctx;
}

describe("session", () => {
	test("provides an initial, empty session per chat", async () => {
		const middleware = makeMiddleware();

		const ctx = await runUpdate(middleware, 1);

		expect(ctx.session).toEqual({});
	});

	test("keeps session changes across updates of the same chat", async () => {
		const middleware = makeMiddleware();

		await runUpdate(middleware, 1, (ctx) => {
			ctx.session.__language_code = "de";
		});
		const ctx = await runUpdate(middleware, 1);

		expect(ctx.session.__language_code).toBe("de");
	});

	test("keeps sessions of different chats separate", async () => {
		const middleware = makeMiddleware();

		await runUpdate(middleware, 1, (ctx) => {
			ctx.session.__language_code = "de";
		});
		const other = await runUpdate(middleware, 2);

		expect(other.session.__language_code).toBeUndefined();
	});

	test("keeps a reassigned session", async () => {
		const middleware = makeMiddleware();

		await runUpdate(middleware, 1, (ctx) => {
			ctx.session = { __language_code: "ru" };
		});
		const ctx = await runUpdate(middleware, 1);

		expect(ctx.session.__language_code).toBe("ru");
	});

	test("does not persist sessions for updates without a chat", async () => {
		const middleware = makeMiddleware();

		await runUpdate(middleware, undefined, (ctx) => {
			ctx.session.__language_code = "de";
		});
		const ctx = await runUpdate(middleware, undefined);

		expect(ctx.session.__language_code).toBeUndefined();
	});
});
