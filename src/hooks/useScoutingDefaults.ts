import useSWR from "swr";
import { apiFetch } from "@/lib/api-client";

export interface MarketDefaults {
  conversionRate: number;
  avgTicket: number;
  fitoutCost: number;
  avgFootfall: number;
}

export interface ScoutingDefaults {
  EUR: MarketDefaults;
  CZK: MarketDefaults;
  PLN: MarketDefaults;
}

export type CurrencyCode = keyof ScoutingDefaults;

export const MARKET_LABELS: Record<CurrencyCode, string> = {
  EUR: 'ES',
  CZK: 'CZ',
  PLN: 'PL',
};

export const SCOUTING_DEFAULTS_FALLBACK: ScoutingDefaults = {
  EUR: { conversionRate: 5, avgTicket: 4.5, fitoutCost: 25000, avgFootfall: 500 },
  CZK: { conversionRate: 5, avgTicket: 115, fitoutCost: 600000, avgFootfall: 400 },
  PLN: { conversionRate: 5, avgTicket: 20, fitoutCost: 100000, avgFootfall: 400 },
};

async function fetchDefaults(): Promise<ScoutingDefaults> {
  // apiFetch, not a bare fetch. This used to send no sign-in at all, which
  // worked only because the settings endpoint accepted requests without one.
  // Now that it does not, a bare fetch would get a 401 and land in the silent
  // fallback below, and every person would quietly start scouting with the
  // built-in ticket prices, footfall and fit-out costs instead of the ones in
  // the admin settings screen, with nothing on screen to say so.
  let data: unknown;
  try {
    data = await apiFetch<unknown>("/api/db/settings?key=scouting_defaults");
  } catch {
    return SCOUTING_DEFAULTS_FALLBACK;
  }
  if (!data || typeof data !== "object" || !(data as ScoutingDefaults).EUR) {
    return SCOUTING_DEFAULTS_FALLBACK;
  }
  const parsed = data as ScoutingDefaults;
  return {
    EUR: { ...SCOUTING_DEFAULTS_FALLBACK.EUR, ...parsed.EUR },
    CZK: { ...SCOUTING_DEFAULTS_FALLBACK.CZK, ...parsed.CZK },
    PLN: { ...SCOUTING_DEFAULTS_FALLBACK.PLN, ...parsed.PLN },
  };
}

export function useScoutingDefaults() {
  const { data, error, isLoading, mutate } = useSWR(
    "scouting-defaults",
    fetchDefaults,
    {
      fallbackData: SCOUTING_DEFAULTS_FALLBACK,
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    }
  );

  const updateDefaults = async (newDefaults: ScoutingDefaults) => {
    await apiFetch("/api/db/settings", {
      method: "PUT",
      body: JSON.stringify({ key: "scouting_defaults", value: newDefaults }),
    });
    mutate(newDefaults);
  };

  return {
    defaults: data ?? SCOUTING_DEFAULTS_FALLBACK,
    isLoading,
    error,
    updateDefaults,
  };
}
