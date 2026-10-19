import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { cities, type City } from "@/components/CitySelector";

const FALLBACK_CITY_ID = "madrid";

function findActiveCity(cityId: string | undefined | null): City | null {
  if (!cityId) return null;
  const city = cities.find(c => c.id === cityId);
  if (!city || !city.active) return null;
  return city;
}

function getFallbackCity(): City {
  return cities.find(c => c.id === FALLBACK_CITY_ID)!;
}

export function getStoredDefaultCity(user: User | null): City {
  if (!user) return getFallbackCity();
  const savedId = (user.user_metadata as Record<string, unknown> | undefined)?.default_city;
  if (typeof savedId !== "string") return getFallbackCity();
  return findActiveCity(savedId) ?? getFallbackCity();
}

export function hasStoredDefaultCity(user: User | null): boolean {
  if (!user) return false;
  const savedId = (user.user_metadata as Record<string, unknown> | undefined)?.default_city;
  return typeof savedId === "string" && savedId.length > 0;
}

// Retries once on failure so a single network blip does not strand the user
// behind the picker. Caller should surface a toast on { ok: false }.
export async function saveDefaultCity(
  user: User,
  cityId: string,
): Promise<{ ok: boolean }> {
  if (!supabase) return { ok: false };

  const attempt = async () => {
    // Only our own key: Supabase merges metadata keys, and sending back the
    // whole (possibly stale) object would undo other settings saved since.
    const { error } = await supabase!.auth.updateUser({
      data: { default_city: cityId },
    });
    return !error;
  };

  if (await attempt()) return { ok: true };
  if (await attempt()) return { ok: true };
  return { ok: false };
}

export function shouldShowOnboardingPicker(user: User | null): boolean {
  if (!user) return false;
  return !hasStoredDefaultCity(user);
}

// ---------------------------------------------------------------------------
// "What's new": the highest update id this person has closed the popup on.
// Kept on the account (so a phone knows what the laptop saw) and mirrored in
// localStorage per account, so the popup never flashes back while the save is
// in flight, if it fails, or for a second account on the same computer.
// ---------------------------------------------------------------------------

const WHATS_NEW_KEY = "whats_new_seen";
const localSeenKey = (userId: string) => `miners-whats-new-seen:${userId}`;

function readLocalSeen(userId: string): number | null {
  try {
    const n = Number(localStorage.getItem(localSeenKey(userId)));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function readAccountSeen(user: User): number | null {
  const saved = (user.user_metadata as Record<string, unknown> | undefined)?.[WHATS_NEW_KEY];
  return typeof saved === "number" && saved > 0 ? saved : null;
}

/** Highest id seen, from the account or this device. Null = never closed it. */
export function getWhatsNewSeen(user: User): number | null {
  return Math.max(readAccountSeen(user) ?? 0, readLocalSeen(user.id) ?? 0) || null;
}

/** Fire-and-forget: the local copy alone keeps the popup closed if this fails. */
export async function saveWhatsNewSeen(user: User, id: number): Promise<void> {
  try {
    if ((readLocalSeen(user.id) ?? 0) < id) localStorage.setItem(localSeenKey(user.id), String(id));
  } catch {
    // Private mode: the account copy below still covers it.
  }
  if (!supabase || (readAccountSeen(user) ?? 0) >= id) return;
  // updateUser reports failure in `error`, it does not throw; one retry, like
  // saveDefaultCity, so a single blip does not bring the popup back.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await supabase.auth.updateUser({ data: { [WHATS_NEW_KEY]: id } });
      if (!error) return;
    } catch {
      // Offline: fall through to the retry, then rely on the local copy.
    }
  }
}
