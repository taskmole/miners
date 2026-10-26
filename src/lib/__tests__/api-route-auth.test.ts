import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Every server route must check who is calling. On 2026-10-26 /api/feedback
// turned out to have no check at all, so anyone on the internet could send
// unlimited emails through our Resend account. This test reads every route
// file and fails when a request handler has no sign-in or secret check, unless
// the handler is listed below with the reason it may stay open.

const APP_DIR = path.resolve(__dirname, "../../app");

// Any one of these inside a handler counts as "checks the caller".
// getTokenFromRequest alone is enough because the token then goes to the
// database, which verifies it and applies the row rules.
const AUTH_MARKERS = [
  "authenticateRequest",
  "authenticateAlongside",
  "getTokenFromRequest",
  "CRON_SECRET", // Vercel cron jobs
  "DIGEST_SECRET", // GitHub Actions jobs
];

// "route file:METHOD" -> why it may answer strangers. Keep this short and keep
// the reasons honest: adding a line here is a decision to leave a door open.
export const PUBLIC_HANDLERS: Record<string, string> = {
  "auth/callback/route.ts:GET": "the sign-in itself; nobody is signed in yet",
  "api/data-file-blocked/route.ts:GET": "always answers 404, serves nothing",
  "api/income/route.ts:GET": "static Madrid income layer; the same file is public on GitHub (owner's decision)",
  "api/population/route.ts:GET": "static population layer; the same file is public on GitHub (owner's decision)",
  "api/traffic/route.ts:GET": "static traffic counts; the same file is public on GitHub (owner's decision)",
};

const METHODS = "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS";

/** The body of each exported request handler in a route file, by method. */
export function handlers(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(
    `export\\s+(?:async\\s+function\\s+(${METHODS})\\b|function\\s+(${METHODS})\\b|const\\s+(${METHODS})\\b)`,
    "g",
  );
  const found = [...source.matchAll(re)];
  found.forEach((m, i) => {
    const start = m.index ?? 0;
    // A handler runs until the next top-level export (or the end of the file).
    const nextExport = source.slice(start + 1).search(/\nexport\s/);
    const end = nextExport === -1 ? source.length : start + 1 + nextExport;
    out.set(m[1] || m[2] || m[3], source.slice(start, end));
  });
  return out;
}

/**
 * Helpers in the same file that do the check for a handler, e.g.
 * `async function requireTrainer(req) { await authenticateRequest(req) ... }`.
 * Calling one of these counts as checking the caller.
 */
function checkingHelpers(source: string): string[] {
  const names: string[] = [];
  const re = /^(?:async\s+)?function\s+(\w+)\s*\(/gm;
  for (const m of source.matchAll(re)) {
    const start = m.index ?? 0;
    const next = source.slice(start + 1).search(/\n(?:export\s|(?:async\s+)?function\s)/);
    const body = source.slice(start, next === -1 ? source.length : start + 1 + next);
    if (AUTH_MARKERS.some((marker) => body.includes(marker))) names.push(`${m[1]}(`);
  }
  return names;
}

/** One message per handler that neither checks the caller nor is listed. */
export function openHandlers(
  files: { file: string; source: string }[],
  allowed: Record<string, string> = PUBLIC_HANDLERS,
): string[] {
  const problems: string[] = [];
  for (const { file, source } of files) {
    const markers = [...AUTH_MARKERS, ...checkingHelpers(source)];
    for (const [method, body] of handlers(source)) {
      const key = `${file}:${method}`;
      if (allowed[key]) continue;
      if (!markers.some((marker) => body.includes(marker))) {
        problems.push(`${key} has no sign-in or secret check`);
      }
    }
  }
  return problems;
}

function routeFiles(dir = APP_DIR): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") out.push(...routeFiles(full));
    } else if (/^route\.(ts|tsx|js)$/.test(entry.name)) {
      out.push({
        file: path.relative(APP_DIR, full).split(path.sep).join("/"),
        source: fs.readFileSync(full, "utf8"),
      });
    }
  }
  return out;
}

describe("API routes check who is calling", () => {
  it("every request handler has a sign-in or secret check, or is listed as public", () => {
    expect(openHandlers(routeFiles())).toEqual([]);
  });

  it("the public list has no stale entries", () => {
    const present = new Set(
      routeFiles().flatMap(({ file, source }) => [...handlers(source).keys()].map((m) => `${file}:${m}`)),
    );
    const stale = Object.keys(PUBLIC_HANDLERS).filter((key) => !present.has(key));
    expect(stale).toEqual([]);
  });

  it("catches a handler without a check, per method", () => {
    const source = `
      export async function GET(req) { const auth = await authenticateRequest(req); }
      export async function POST(req) { await sendEmail(await req.json()); }
    `;
    expect(openHandlers([{ file: "api/x/route.ts", source }], {})).toEqual([
      "api/x/route.ts:POST has no sign-in or secret check",
    ]);
  });

  it("counts a same-file helper that does the check", () => {
    const source = `
async function requireTrainer(req) {
  const auth = await authenticateRequest(req);
  return auth;
}
function format(x) { return x; }
export async function GET(req) { const t = await requireTrainer(req); }
export async function POST(req) { return format(await req.json()); }
`;
    expect(openHandlers([{ file: "api/z/route.ts", source }], {})).toEqual([
      "api/z/route.ts:POST has no sign-in or secret check",
    ]);
  });

  it("does not let a check in one handler cover the next one", () => {
    const source = `
      export function GET(req) { return getTokenFromRequest(req); }
      export const DELETE = async () => wipe();
    `;
    expect(openHandlers([{ file: "api/y/route.ts", source }], {})).toEqual([
      "api/y/route.ts:DELETE has no sign-in or secret check",
    ]);
  });
});
