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
  const res = await fetch("/api/db/settings?key=scouting_defaults");
  if (!res.ok) return SCOUTING_DEFAULTS_FALLBACK;
  const data = await res.json();
  if (!data || typeof data !== "object" || !data.EUR) return SCOUTING_DEFAULTS_FALLBACK;
  return {
    EUR: { ...SCOUTING_DEFAULTS_FALLBACK.EUR, ...data.EUR },
    CZK: { ...SCOUTING_DEFAULTS_FALLBACK.CZK, ...data.CZK },
    PLN: { ...SCOUTING_DEFAULTS_FALLBACK.PLN, ...data.PLN },
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
