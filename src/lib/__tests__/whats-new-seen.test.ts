import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";

const updateUser = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { updateUser: (...a: unknown[]) => updateUser(...a) } } }));

import { getWhatsNewSeen, saveWhatsNewSeen } from "../userPreferences";

const user = (meta: Record<string, unknown> = {}, id = "u1") =>
  ({ id, user_metadata: meta }) as unknown as User;
const key = (id = "u1") => `miners-whats-new-seen:${id}`;

beforeEach(() => {
  localStorage.clear();
  updateUser.mockReset();
  updateUser.mockResolvedValue({ error: null });
});

describe("getWhatsNewSeen", () => {
  it("is null when nothing was ever saved", () => {
    expect(getWhatsNewSeen(user())).toBeNull();
  });

  it("takes the higher of the account and this device", () => {
    localStorage.setItem(key(), "2");
    expect(getWhatsNewSeen(user({ whats_new_seen: 5 }))).toBe(5);
    localStorage.setItem(key(), "7");
    expect(getWhatsNewSeen(user({ whats_new_seen: 5 }))).toBe(7);
  });

  it("ignores junk values", () => {
    localStorage.setItem(key(), "abc");
    expect(getWhatsNewSeen(user({ whats_new_seen: "3" }))).toBeNull();
    localStorage.setItem(key(), "-1");
    expect(getWhatsNewSeen(user({ whats_new_seen: 0 }))).toBeNull();
  });

  it("keeps each account's device copy apart", () => {
    localStorage.setItem(key("someone-else"), "9");
    expect(getWhatsNewSeen(user())).toBeNull();
  });

  it("survives storage that throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(getWhatsNewSeen(user({ whats_new_seen: 4 }))).toBe(4);
    spy.mockRestore();
  });
});

describe("saveWhatsNewSeen", () => {
  it("saves on this device and sends only its own key to the account", async () => {
    await saveWhatsNewSeen(user({ default_city: "madrid" }), 3);
    expect(localStorage.getItem(key())).toBe("3");
    expect(updateUser).toHaveBeenCalledWith({ data: { whats_new_seen: 3 } });
  });

  it("skips the account write when the account already has it", async () => {
    await saveWhatsNewSeen(user({ whats_new_seen: 4 }), 3);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("never lowers the device copy", async () => {
    localStorage.setItem(key(), "6");
    await saveWhatsNewSeen(user(), 3);
    expect(localStorage.getItem(key())).toBe("6");
  });

  it("retries once when the account save reports an error", async () => {
    updateUser.mockResolvedValueOnce({ error: { message: "blip" } });
    await saveWhatsNewSeen(user(), 3);
    expect(updateUser).toHaveBeenCalledTimes(2);
  });
});
