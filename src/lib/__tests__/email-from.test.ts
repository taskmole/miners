import { describe, it, expect, afterEach } from "vitest";
import { getFromAddress, isSandboxSender } from "../email";

const SANDBOX = "Miners Scout <onboarding@resend.dev>";
const GOOD = "Miners Scout <scouting@revy.pro>";

function withFrom(value: string | undefined): string {
  if (value === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = value;
  return getFromAddress();
}

afterEach(() => {
  delete process.env.RESEND_FROM;
});

/**
 * Every case here is a value someone can end up with by pasting into the
 * Vercel dashboard. Each one used to make Resend reject the send with a 422,
 * which looks exactly like "the emails just do not arrive" in production.
 */
describe("getFromAddress", () => {
  it("falls back to the sandbox sender when unset or blank", () => {
    expect(withFrom(undefined)).toBe(SANDBOX);
    expect(withFrom("   ")).toBe(SANDBOX);
  });

  it("passes a correct value through unchanged", () => {
    expect(withFrom(GOOD)).toBe(GOOD);
  });

  it("strips straight and smart quotes", () => {
    expect(withFrom(`"${GOOD}"`)).toBe(GOOD);
    expect(withFrom(`'${GOOD}'`)).toBe(GOOD);
    expect(withFrom(`“${GOOD}”`)).toBe(GOOD);
  });

  it("flattens stray whitespace and line breaks", () => {
    expect(withFrom(`  Miners  Scout \n <scouting@revy.pro> `)).toBe(GOOD);
  });

  it("adds the angle brackets when they are missing", () => {
    expect(withFrom("Miners Scout scouting@revy.pro")).toBe(GOOD);
  });

  it("accepts a bare address", () => {
    expect(withFrom("scouting@revy.pro")).toBe("scouting@revy.pro");
  });

  it("drops a display name that is not a name", () => {
    expect(withFrom('RESEND_FROM="Miners Scout <scouting@revy.pro>"')).toBe("scouting@revy.pro");
  });

  it("falls back when there is no address at all", () => {
    expect(withFrom("Miners Scout")).toBe(SANDBOX);
  });

  it("reports sandbox mode only for the resend.dev sender", () => {
    withFrom(GOOD);
    expect(isSandboxSender()).toBe(false);
    withFrom(undefined);
    expect(isSandboxSender()).toBe(true);
  });
});
