/**
 * Version information for regexYbot — single source of truth.
 *
 * Resolution tiers (first non-null wins):
 *   1. git commands (works in dev with git installed)
 *   2. raw .git file reading (works without git binary)
 *   3. environment variables (Docker via build args → ENV)
 *   4. fallback (commit=0000000, version from package.json, today, null changes)
 *
 * When run directly (`bun run src/version.ts`), writes .version.json for binary builds.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

// ---- Types ----

interface VersionInfo {
	version: string;
	commit: string;
	releasedAt: string;
	changes: string | null;
}

// ---- Package version ----

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8")) as {
	version: string;
};

// ---- Fallback (the "main" values for all contexts) ----

const FALLBACK: VersionInfo = {
	version: pkg.version,
	commit: "0000000",
	releasedAt: new Date().toISOString().split("T")[0],
	changes: null,
};

// ============================================================
// Tier 1: git commands
// ============================================================

function resolveFromGit(): VersionInfo | null {
	try {
		const commitProc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]);
		if (!commitProc.success) return null;
		const commit = commitProc.stdout.toString().trim();

		const changesProc = Bun.spawnSync([
			"git",
			"log",
			"-1",
			"--format=%b",
			"HEAD",
		]);
		const changes = changesProc.success
			? changesProc.stdout.toString().trim() || null
			: null;

		return {
			version: pkg.version,
			commit,
			releasedAt: new Date().toISOString().split("T")[0],
			changes,
		};
	} catch {
		return null;
	}
}

// ============================================================
// Tier 2: raw .git file reading (no git binary required)
// ============================================================

function readGitFile(path: string): string | null {
	try {
		return readFileSync(path, "utf-8").trim();
	} catch {
		return null;
	}
}

function resolveGitDir(): {
	gitDir: string;
	commonDir: string;
} | null {
	const gitPath = join(root, ".git");
	try {
		const st = statSync(gitPath);
		if (st.isDirectory()) return { gitDir: gitPath, commonDir: gitPath };
	} catch {
		// Not a directory — likely a worktree file, handled below
	}

	// Worktree — .git is a file pointing to the actual git dir
	const content = readGitFile(gitPath);
	if (!content) return null;
	const match = content.match(/^gitdir:\s*(.+)$/);
	const workGitDir = match ? match[1] : gitPath;

	const commonDirFile = join(workGitDir, "commondir");
	const rel = readGitFile(commonDirFile);
	if (rel) {
		return { gitDir: workGitDir, commonDir: resolve(workGitDir, rel) };
	}
	return { gitDir: workGitDir, commonDir: workGitDir };
}

function resolveHeadRaw(gitDir: string, commonDir: string): string | null {
	const head = readGitFile(join(gitDir, "HEAD"));
	if (!head) return null;

	// Detached HEAD — direct hash
	if (/^[0-9a-f]{40}$/.test(head)) return head;

	// Symbolic ref — resolve it (refs live in commonDir)
	const match = head.match(/^ref: (.+)$/);
	if (!match) return null;

	return readGitFile(join(commonDir, match[1]));
}

function readCommitBodyRaw(hash: string, commonDir: string): string {
	const dir = hash.slice(0, 2);
	const file = hash.slice(2);
	const objPath = join(commonDir, "objects", dir, file);

	if (!existsSync(objPath)) return "";

	try {
		const compressed = readFileSync(objPath);
		const decompressed = inflateSync(compressed);
		const content = decompressed.toString("utf-8");

		const blankLineIdx = content.indexOf("\n\n");
		if (blankLineIdx === -1) return "";
		return content.slice(blankLineIdx + 2).trim();
	} catch {
		return "";
	}
}

function resolveFromRawGit(): VersionInfo | null {
	const dirs = resolveGitDir();
	if (!dirs) return null;

	const commitHash = resolveHeadRaw(dirs.gitDir, dirs.commonDir);
	if (!commitHash) return null;

	return {
		version: pkg.version,
		commit: commitHash.slice(0, 7),
		releasedAt: new Date().toISOString().split("T")[0],
		changes: readCommitBodyRaw(commitHash, dirs.commonDir) || null,
	};
}

// ============================================================
// Tier 3: environment variables (Docker build args → ENV)
// ============================================================

function resolveFromEnv(): VersionInfo | null {
	const version = process.env.VERSION;
	const commit = process.env.COMMIT;
	if (version && commit) {
		return {
			version,
			commit,
			releasedAt:
				process.env.RELEASED_AT ?? new Date().toISOString().split("T")[0],
			changes: process.env.CHANGES ?? null,
		};
	}
	return null;
}

// ============================================================
// Resolution
// ============================================================

const info: VersionInfo =
	resolveFromGit() ?? resolveFromRawGit() ?? resolveFromEnv() ?? FALLBACK;

// ---- Exports ----

export const VERSION = info.version;
export const COMMIT = info.commit;
export const RELEASED_AT = info.releasedAt;
export const CHANGES = info.changes;

// ============================================================
// Generation — writes .version.json for binary builds (--define)
// ============================================================

function generate(): void {
	const json = JSON.stringify(info, null, 2);
	writeFileSync(join(root, ".version.json"), json, "utf-8");
	console.log(`Generated .version.json: v${info.version} (${info.commit})`);
}

// ---- CLI ----

function printUsage(): void {
	console.log(`Usage: bun src/version.ts [subcommand]

Subcommands:
  version      Print version string
  commit       Print commit hash
  released-at  Print release date
  changes      Print commit body / changes text
  generate     Write .version.json file (default)

With no subcommand, prints a summary line and generates .version.json.`);
}

function main(): void {
	const subcommand = process.argv[2];

	if (subcommand === "-h" || subcommand === "--help") {
		printUsage();
		return;
	}

	switch (subcommand) {
		case "version":
			console.log(info.version);
			break;
		case "commit":
			console.log(info.commit);
			break;
		case "released-at":
			console.log(info.releasedAt);
			break;
		case "changes":
			if (info.changes) console.log(info.changes);
			break;
		case "generate":
			generate();
			break;
		case undefined:
			console.log(`v${info.version} (${info.commit}) ${info.releasedAt}`);
			generate();
			break;
		default:
			console.error(`Unknown subcommand: ${subcommand}`);
			process.exit(1);
	}
}

// ---- Entry point ----

if (import.meta.main) main();
