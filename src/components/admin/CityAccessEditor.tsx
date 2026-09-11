"use client";

/**
 * City access editor: the replacement for the Role dropdown.
 *
 * A person is described by two things and nothing else:
 *   - a Super Admin switch (everything, everywhere)
 *   - a level per city, plus per-city extras
 *
 * One line per city. The level control always shows all four options including
 * "No access", so the off state is a visible choice rather than an absence, and
 * so the cumulative ladder is readable left to right. The extras only appear
 * once the person actually has access, because financials and alerts are
 * meaningless for a city they cannot open.
 *
 * Presentation only. It holds no opinion about who is allowed to change what;
 * the caller passes the limits and the database enforces the truth.
 */

import { Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** What a person may do in one city. Ordered weakest to strongest. */
export type CityLevel = "view" | "contribute" | "approve";

export const CITY_LEVELS: { id: CityLevel; label: string; hint: string }[] = [
  { id: "view", label: "View", hint: "Can look at the map. Nothing else." },
  { id: "contribute", label: "Contribute", hint: "Can submit pitches, request properties, comment and draw." },
  { id: "approve", label: "Approve", hint: "Everything above, plus approves requests and gets the decision emails." },
];

/** One city's access for one person. Absent from the array means no access. */
export interface CityGrant {
  cityId: string;
  level: CityLevel;
  canSeeFinancials: boolean;
  /** Property alert emails, now chosen per city rather than once globally. */
  receivesAlerts: boolean;
}

export interface CityOption {
  id: string;
  name: string;
  /** False for a city that exists but is not selectable on the map yet. */
  enabled: boolean;
}

interface CityAccessEditorProps {
  cities: CityOption[];
  grants: CityGrant[];
  onChange: (grants: CityGrant[]) => void;
  /** Cities the editor may touch. Undefined means all of them. */
  allowedCityIds?: string[];
  /** Highest level the editor may hand out. Approvers can only give Contribute. */
  maxLevel?: CityLevel;
}

const LEVEL_RANK: Record<CityLevel, number> = { view: 0, contribute: 1, approve: 2 };

/** The four states of the control, with "none" first so off reads as a choice. */
type Segment = "none" | CityLevel;
const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "none", label: "No access" },
  { id: "view", label: "View" },
  { id: "contribute", label: "Contribute" },
  { id: "approve", label: "Approve" },
];

export function CityAccessEditor({
  cities,
  grants,
  onChange,
  allowedCityIds,
  maxLevel = "approve",
}: CityAccessEditorProps) {
  const grantFor = (cityId: string) => grants.find((g) => g.cityId === cityId);
  const mayEdit = (cityId: string) => !allowedCityIds || allowedCityIds.includes(cityId);

  const setLevel = (cityId: string, segment: Segment) => {
    if (segment === "none") {
      onChange(grants.filter((g) => g.cityId !== cityId));
      return;
    }
    const existing = grantFor(cityId);
    if (existing) {
      onChange(grants.map((g) => (g.cityId === cityId ? { ...g, level: segment } : g)));
      return;
    }
    // New access starts quiet: no financials, no alerts. Both are opt-in.
    onChange([
      ...grants,
      { cityId, level: segment, canSeeFinancials: false, receivesAlerts: false },
    ]);
  };

  const setExtra = (cityId: string, patch: Partial<CityGrant>) => {
    onChange(grants.map((g) => (g.cityId === cityId ? { ...g, ...patch } : g)));
  };

  return (
    <div className="space-y-2">
      {cities.map((city) => {
        const grant = grantFor(city.id);
        const editable = mayEdit(city.id);
        const current: Segment = grant?.level ?? "none";

        return (
          <div
            key={city.id}
            className={cn(
              "rounded-lg border px-3 py-2.5",
              grant ? "border-zinc-200 bg-white" : "border-zinc-200/70 bg-zinc-50/60",
            )}
          >
            {/* City name and the level control share one line at every width.
                Labels shrink rather than wrap: "Contribute" is the long one and
                it clears 375px at 11px with the tight padding below. */}
            <div className="flex items-center gap-2">
              <div className="w-[68px] sm:w-24 shrink-0 min-w-0">
                <div
                  className={cn(
                    "text-sm font-medium truncate",
                    grant ? "text-zinc-900" : "text-zinc-500",
                  )}
                >
                  {city.name}
                </div>
                {!city.enabled && (
                  <div className="text-[10px] uppercase tracking-wide text-zinc-400 leading-tight">
                    soon
                  </div>
                )}
              </div>

              <div
                role="radiogroup"
                aria-label={`Access level for ${city.name}`}
                className="flex-1 grid grid-cols-4 gap-0.5 p-0.5 rounded-md bg-zinc-100"
              >
                {SEGMENTS.map((segment) => {
                  const selected = current === segment.id;
                  const tooStrong =
                    segment.id !== "none" && LEVEL_RANK[segment.id] > LEVEL_RANK[maxLevel];
                  const disabled = !editable || tooStrong;
                  return (
                    <button
                      key={segment.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      title={
                        tooStrong
                          ? "Only a Super Admin can give this level"
                          : segment.id === "none"
                            ? "Cannot open this city at all"
                            : CITY_LEVELS.find((l) => l.id === segment.id)?.hint
                      }
                      onClick={() => setLevel(city.id, segment.id)}
                      className={cn(
                        "min-h-[34px] rounded text-[11px] sm:text-xs font-medium transition-colors px-0.5 leading-none",
                        selected
                          ? segment.id === "none"
                            ? "bg-white text-zinc-500 shadow-sm"
                            : "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-400 hover:text-zinc-700",
                        disabled && !selected && "opacity-40 cursor-not-allowed hover:text-zinc-400",
                      )}
                    >
                      {segment.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Extras appear only once there is access to attach them to.
                Chips rather than switches: they are two small on/off extras
                hanging off the level above, not a separate settings section, so
                they get no separator and sit directly under the control they
                belong to. */}
            {grant && (
              <div className="flex items-center gap-5 mt-2 pl-[76px] sm:pl-[104px]">
                <ExtraToggle
                  label="Financials"
                  on={grant.canSeeFinancials}
                  disabled={!editable}
                  onChange={(v) => setExtra(city.id, { canSeeFinancials: v })}
                />
                <ExtraToggle
                  label="Alerts"
                  on={grant.receivesAlerts}
                  disabled={!editable}
                  onChange={(v) => setExtra(city.id, { receivesAlerts: v })}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A small on/off extra attached to one city's access.
 *
 * The switch is the app's normal one at its normal size. An earlier version
 * shrank it with a transform, which is what made the row sit at an odd height
 * and refuse to line up with anything.
 */
function ExtraToggle({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 cursor-pointer select-none",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className={cn("text-xs", on ? "text-zinc-900 font-medium" : "text-zinc-500")}>
        {label}
      </span>
      <Switch checked={on} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

/** The collapsed line shown instead of the city list for a Super Admin. */
export function SuperAdminBanner() {
  return (
    <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-zinc-900 text-white">
      <Check className="w-4 h-4 shrink-0" />
      <span className="text-sm">Full access to every city, nothing to choose</span>
    </div>
  );
}

/**
 * The one-line summary used in the user list, where four pills would not fit
 * at 375px. Shows the strongest thing a person can do and how widely.
 */
export function accessSummary(
  isSuperAdmin: boolean,
  grants: CityGrant[],
): { label: string; tone: "dark" | "green" | "blue" | "grey" | "amber" } {
  if (isSuperAdmin) return { label: "Super Admin", tone: "dark" };
  if (grants.length === 0) return { label: "No access", tone: "amber" };

  const strongest = grants.reduce((best, g) =>
    LEVEL_RANK[g.level] > LEVEL_RANK[best.level] ? g : best,
  );
  const count = grants.filter((g) => g.level === strongest.level).length;
  const where = count === 1 ? "1 city" : `${count} cities`;
  const label = `${CITY_LEVELS.find((l) => l.id === strongest.level)?.label} · ${where}`;

  const tone =
    strongest.level === "approve" ? "green" : strongest.level === "contribute" ? "blue" : "grey";
  return { label, tone };
}
