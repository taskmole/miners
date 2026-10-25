import { describe, it, expect, vi, beforeEach } from "vitest";
import { focusPath } from "@/lib/place-id";
import { sessionStorageKey } from "@/lib/map-prefetch";
import { alreadyForwarded, buildShareForwardScript } from "../forward-script";

const SUPABASE_URL = "https://sybuvcpmybdsuduthvom.supabase.co";
const KEY = sessionStorageKey(SUPABASE_URL);
const TARGET = focusPath("property-40.41680--3.70380-abc123ef");
type W = Window & { __minersShareForwarded?: boolean };

/** Run the script with a stand-in for location, which jsdom will not let us spy on. */
function runScript(target = TARGET) {
    const location = { replace: vi.fn() };
    new Function("location", buildShareForwardScript(target, SUPABASE_URL)!)(location);
    return location.replace;
}

beforeEach(() => {
    localStorage.clear();
    delete (window as W).__minersShareForwarded;
});

describe("share page forward script", () => {
    it("forwards a browser holding a Miners session, once, to the place", () => {
        localStorage.setItem(KEY, JSON.stringify({ access_token: "a.b.c", refresh_token: "r" }));
        const replace = runScript();
        expect(replace).toHaveBeenCalledTimes(1);
        expect(replace).toHaveBeenCalledWith(TARGET);
        expect(alreadyForwarded()).toBe(true);
    });

    it("leaves a browser without a session (chat previews, signed-out people) alone", () => {
        expect(runScript()).not.toHaveBeenCalled();
        expect(alreadyForwarded()).toBe(false);
    });

    it("leaves a stored session without a token alone", () => {
        localStorage.setItem(KEY, JSON.stringify({ user: { id: "u1" } }));
        expect(runScript()).not.toHaveBeenCalled();
    });

    it("never throws on a broken stored session", () => {
        localStorage.setItem(KEY, "{not json");
        expect(runScript()).not.toHaveBeenCalled();
        expect(alreadyForwarded()).toBe(false);
    });

    it("reads the same session key the app uses", () => {
        expect(buildShareForwardScript(TARGET, SUPABASE_URL)).toContain(JSON.stringify(KEY));
    });

    it("cannot be broken out of by the target", () => {
        const nasty = '/?focus=x</script><script>alert(1)</script>"\'';
        const script = buildShareForwardScript(nasty, SUPABASE_URL)!;
        expect(script).not.toContain("</script>");
        localStorage.setItem(KEY, JSON.stringify({ access_token: "a.b.c" }));
        expect(runScript(nasty)).toHaveBeenCalledWith(nasty);
    });

    it("is left out when Supabase is not configured", () => {
        expect(buildShareForwardScript(TARGET, undefined)).toBeNull();
    });
});
