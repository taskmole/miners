"use client";

/**
 * City access editor: the replacement for the Role dropdown.
 *
 * A person is described by two things and nothing else:
 *   - a Super Admin switch (everything, everywhere)
 *   - a level per city, plus per-city extras
 *
 * One row per city, and the row answers two separate questions in the order
 * somebody actually asks them:
 *
 *   1. Can they open this city at all?   -> the Off / On control on the right
 *   2. And what may they do in it?       -> View / Contribute / Approve
 *
 * That split is why the four-way "No access | View | Contribute | Approve"
 * control is gone. Four labels sharing one track meant "No access" competed
 * for attention with three things it is not, and at 375px "Contribute" had
 * about 63px to live in. Off / On is the same control used for Account and
 * Super Admin higher up the page, so every yes/no on the screen now sits on
 * the same right-hand edge at the same height.
 *
 * Everything below the head line only exists once the city is on, because the
 * level, the financials tick and the alerts tick are all meaningless for a
 * city somebody cannot open.
 *
 * One layout, phone and desktop alike. There is no wide variant that puts the
 * level control on the same line as the city name. The extra width made the
 * row harder to read, not easier: four controls strung across 850px gave the
 * eye no order to follow, and the hint line ended up floating between two
 * things it did not obviously belong to. Stacked, the row reads top to bottom
 * in the order the questions are actually asked - can they open it, what may
 * they do, then the two extras - and every control lands on the same
 * right-hand edge.
 *
 * Presentation only. It holds no opinion about who is allowed to change what;
 * the caller passes the limits and the database enforces the truth.
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEVEL_RANK, type CityGrant, type CityLevel } from "@/lib/permissions";

export type { CityGrant, CityLevel };

export const CITY_LEVELS: { id: CityLevel; label: string; hint: string }[] = [
  { id: "view", label: "View", hint: "Can see the city on the map. Nothing else." },
  { id: "contribute", label: "Contribute", hint: "Can add locations, photos and notes for review." },
  { id: "approve", label: "Approve", hint: "Can contribute and sign off on submissions." },
];

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
  /**
   * Greys the whole list out and stops it responding. Used when the person is
   * a Super Admin: the rows stay on screen, faded, so it is obvious there is a
   * city list and equally obvious it no longer decides anything. Hiding it
   * instead made the panel look broken the first time somebody flipped the
   * switch.
   */
  dimmed?: boolean;
}

export function CityAccessEditor({
  cities,
  grants,
  onChange,
  allowedCityIds,
  maxLevel = "approve",
  dimmed = false,
}: CityAccessEditorProps) {
  const grantFor = (cityId: string) => grants.find((g) => g.cityId === cityId);
  const mayEdit = (cityId: string) =>
    !dimmed && (!allowedCityIds || allowedCityIds.includes(cityId));

  /** Turning a city on starts at the weakest level. Promotion is deliberate. */
  const setAccess = (cityId: string, on: boolean) => {
    if (!on) {
      onChange(grants.filter((g) => g.cityId !== cityId));
      return;
    }
    if (grantFor(cityId)) return;
    // New access starts quiet: View, no financials, no alerts. All opt-in.
    onChange([
      ...grants,
      { cityId, level: "view", receivesAlerts: false },
    ]);
  };

  const setLevel = (cityId: string, level: CityLevel) => {
    onChange(grants.map((g) => (g.cityId === cityId ? { ...g, level } : g)));
  };

  const setExtra = (cityId: string, patch: Partial<CityGrant>) => {
    onChange(grants.map((g) => (g.cityId === cityId ? { ...g, ...patch } : g)));
  };

  return (
    <div className={cn(dimmed && "opacity-40 pointer-events-none select-none")}>
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
        Cities
      </h3>

      {/* Rows, not nested cards.
          Each city used to be its own bordered box with its own padding, which
          pushed every label 13px right of "Super Admin" above it and every
          control 13px left of the Account control. Plain rows separated by a
          hairline put the whole screen on one left edge and one right edge. */}
      <div className="divide-y divide-zinc-100 border-t border-zinc-100">
        {cities.map((city) => {
          const grant = grantFor(city.id);
          const editable = mayEdit(city.id);

          return (
            <div key={city.id} className="py-3">
              {/* 1. Can they open this city at all? */}
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 flex items-baseline gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium truncate",
                      grant ? "text-zinc-900" : "text-zinc-500",
                    )}
                  >
                    {city.name}
                  </span>
                  {!city.enabled && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-zinc-100 text-zinc-400">
                      Soon
                    </span>
                  )}
                </div>

                <OnOffSegments
                  ariaLabel={`Access to ${city.name}`}
                  on={!!grant}
                  disabled={!editable}
                  onChange={(on) => setAccess(city.id, on)}
                />
              </div>

              {grant && (
                <>
                  {/* 2. And what may they do in it? Full width, directly under
                         the switch that turned it on. */}
                  <LevelSegments
                    cityName={city.name}
                    level={grant.level}
                    maxLevel={maxLevel}
                    disabled={!editable}
                    onChange={(level) => setLevel(city.id, level)}
                    className="w-full mt-2.5"
                  />

                  {/* Plain English under the control, because "Contribute"
                      means nothing to somebody setting up their first user. */}
                  <p className="text-xs text-zinc-500 mt-1.5">
                    {CITY_LEVELS.find((l) => l.id === grant.level)?.hint}
                  </p>

                  {/* 3. The one extra that is genuinely per city.
                         Financials used to sit here beside it. It never was a
                         per-city choice: is_finance_plus() returned true if
                         ANY city had the tick, and not one of the six finance
                         tables has a city column. It is one row per person at
                         the top of the panel now, and switched off. */}
                  <div className="mt-2.5">
                    <ExtraToggle
                      label="Gets alerts for this city"
                      on={grant.receivesAlerts}
                      disabled={!editable}
                      onChange={(v) => setExtra(city.id, { receivesAlerts: v })}
                    />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** View / Contribute / Approve as three segments, full width under the city. */
function LevelSegments({
  cityName,
  level,
  maxLevel,
  disabled,
  onChange,
  className,
}: {
  cityName: string;
  level: CityLevel;
  maxLevel: CityLevel;
  disabled: boolean;
  onChange: (level: CityLevel) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Access level for ${cityName}`}
      /* p-1 not p-0.5: at 2px the selected white pill sat almost on the grey
         edge and the control read as one solid slab. 4px is enough for the
         pill to look seated inside a track. */
      className={cn("grid grid-cols-3 gap-0.5 p-1 rounded-lg bg-zinc-100", className)}
    >
      {CITY_LEVELS.map((option) => {
        const selected = level === option.id;
        const tooStrong = LEVEL_RANK[option.id] > LEVEL_RANK[maxLevel];
        const locked = disabled || tooStrong;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={locked}
            title={tooStrong ? "Only a super admin can give this level" : option.hint}
            onClick={() => onChange(option.id)}
            className={cn(
              // min-w-0 lets the grid cell actually shrink and truncate keeps a
              // long label inside it. Without the pair, "Contribute" spilled
              // out of its cell and sat on top of "Approve".
              "min-w-0 truncate min-h-[32px] sm:min-h-[30px] rounded-md",
              "text-xs font-medium transition-colors px-1 sm:px-2 leading-none",
              selected
                // ring, not just shadow: on a zinc-100 track a plain shadow-sm
                // gives the white pill almost no edge.
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5"
                : "text-zinc-500 hover:text-zinc-900",
              locked && !selected && "opacity-40 cursor-not-allowed hover:text-zinc-500",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A small on/off extra attached to one city's access.
 *
 * Written as a full sentence rather than a one-word label. "Financials" needed
 * the row around it to be readable; "Can see financials" does not, which is
 * what lets these sit on their own lines instead of side by side.
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
    <div className="flex items-center justify-between gap-3">
      <span
        className={cn(
          "text-xs min-w-0 truncate",
          on ? "text-zinc-900 font-medium" : "text-zinc-500",
          disabled && "opacity-50",
        )}
      >
        {label}
      </span>
      <OnOffSegments ariaLabel={label} on={on} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/**
 * Off / On as two segments, the same shape and metrics as the level control.
 *
 * Exported because the Account status and Super Admin switches at the top of
 * the user page use it too. One control for every yes/no on that screen means
 * they all sit on the same right-hand edge at the same height, instead of the
 * page mixing 48px switches with 30px segments.
 *
 * A switch only ever shows one state, so "is this on?" depends on reading a
 * thumb position. Off and On written out cannot be misread.
 *
 * On is zinc-900, the same near-black as every primary button in the app,
 * rather than a green borrowed from the mock-up. Green here would be the only
 * colour on the screen and would read as a status ("healthy") rather than as a
 * setting somebody chose.
 */
export function OnOffSegments({
  on,
  disabled,
  onChange,
  ariaLabel,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "shrink-0 w-[104px] grid grid-cols-2 gap-0.5 p-1 rounded-lg bg-zinc-100",
        disabled && "opacity-50",
      )}
    >
      {[false, true].map((value) => {
        const selected = on === value;
        return (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={cn(
              "min-w-0 truncate min-h-[32px] sm:min-h-[30px] rounded-md",
              "text-xs font-medium transition-colors leading-none",
              selected
                ? value
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-900/5"
                : "text-zinc-400 hover:text-zinc-900",
              disabled && "cursor-not-allowed",
            )}
          >
            {value ? "On" : "Off"}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The line shown above the city list for a Super Admin.
 *
 * Green, and the one place colour appears in this panel, because it is a
 * statement of fact about the account rather than a control: it says the rows
 * below have stopped mattering, and it needs to be told apart from them at a
 * glance.
 */
export function SuperAdminBanner() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
      <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center">
        <Check className="w-3 h-3 text-white" strokeWidth={3} />
      </span>
      <span className="text-sm text-emerald-800">
        Has full access to every city. The city settings below do not apply.
      </span>
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
