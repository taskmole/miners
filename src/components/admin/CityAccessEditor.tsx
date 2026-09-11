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
    /* Rows, not nested cards.
       Each city used to be its own bordered box with its own padding, which
       pushed every label 13px right of "Super Admin" above it and every
       control 13px left of the Account control. Plain rows separated by a
       hairline put the whole screen on one left edge and one right edge.
       A city with no access is still obvious: its name greys out and the
       white pill sits on "No access". */
    <div className="divide-y divide-zinc-100 border-t border-zinc-100">
      {cities.map((city) => {
        const grant = grantFor(city.id);
        const editable = mayEdit(city.id);
        const current: Segment = grant?.level ?? "none";

        return (
          <div key={city.id} className="py-2.5">
            {/* Two layouts, one breakpoint.
                Below sm the city name gets its own line and the level control
                sits underneath at full width, because four labels sharing a
                row with the city name leaves about 60px each and "Contribute"
                does not fit: the segments overflowed their cells and collided
                with "Approve".
                From sm up there is room for the original single line. */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
              <div className="flex items-baseline gap-2 sm:block sm:w-24 sm:shrink-0 min-w-0">
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
                /* p-1 not p-0.5: at 2px the selected white pill sat almost on
                   the grey edge and the control read as one solid slab. 4px
                   is enough for the pill to look seated inside a track. The
                   height it adds is taken back off the buttons below, so the
                   whole control is shorter than before, not taller. */
                className="w-full sm:w-[420px] sm:shrink-0 sm:ml-auto grid grid-cols-4 gap-0.5 p-1 rounded-lg bg-zinc-100"
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
                        // min-w-0 lets the grid cell actually shrink, and
                        // truncate keeps a long label inside it. Without the
                        // pair, "Contribute" spilled out of its cell and sat
                        // on top of "Approve" instead of being clipped.
                        //
                        // No side padding below sm. At 375px each cell is
                        // about 63px and "Contribute" needs 57px, so padding
                        // is the difference between fitting and truncating.
                        // The label is centred, so it costs nothing to drop.
                        "min-w-0 truncate min-h-[30px] sm:min-h-[28px] rounded-md",
                        "text-[11px] sm:text-xs font-medium transition-colors px-0 sm:px-2 leading-none",
                        selected
                          // ring, not just shadow: on a zinc-100 track a plain
                          // shadow-sm gives the white pill almost no edge.
                          ? segment.id === "none"
                            ? "bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-900/5"
                            : "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-900/5"
                          : "text-zinc-500 hover:text-zinc-900",
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
                They are two small on/off extras hanging off the level above,
                not a separate settings section, so they get no separator and
                sit directly under the control they belong to.

                Below sm they stack, one per line, label left and switch right,
                the same shape as every other switch row on this screen. Side
                by side they left about 70px for a label and a 44px switch,
                which is where the row started fighting itself. From sm up they
                sit inline again, aligned to the control rather than to the
                city name. */}
            {grant && (
              <div className="mt-1.5 space-y-0.5 sm:space-y-0 sm:flex sm:items-center sm:justify-end sm:gap-5">
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
 * Off / On as a two-segment control rather than a switch, matching the level
 * control directly above it. Two reasons. The app's switch is 48x28 on mobile
 * by design, which next to a 30px-tall level control made the extras read as
 * the most important thing in the row. And a switch only ever shows one state,
 * so "is this on?" depends on reading the thumb position; Off and On written
 * out cannot be misread.
 *
 * Green for On is the one place colour is used here, because these two are the
 * settings somebody scans a page for.
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
    <div
      className={cn(
        // Label left, control right on mobile, the same shape as the rest of
        // the page. Inline and snug from sm up, where the two fit side by side.
        "flex items-center justify-between gap-3",
        "sm:justify-start sm:gap-2",
      )}
    >
      <span
        className={cn(
          "text-xs",
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
              "min-w-0 truncate min-h-[30px] sm:min-h-[28px] rounded-md",
              "text-[11px] sm:text-xs font-medium transition-colors leading-none",
              selected
                ? value
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-900/5"
                : "text-zinc-500 hover:text-zinc-900",
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
