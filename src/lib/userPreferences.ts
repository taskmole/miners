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
    const { error } = await supabase!.auth.updateUser({
      data: { ...user.user_metadata, default_city: cityId },
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
