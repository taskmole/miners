"use client";

import type { ReactNode } from "react";
import { Snowflake, Bath, Store, Sparkles } from "lucide-react";
import { ImageCarousel } from "./ImageCarousel";
import { AiBreakdown } from "./AiBreakdown";
import { PHOTO_COLUMN } from "./layout";
import { BreatheGlow } from "@/components/BeamGlow";
import { MapsTile, LinkTile } from "@/components/poi-card/PoiCard";
import { formatShortMoney, isShown } from "@/components/poi-card/card-format";
import { formatPrice } from "@/types/inbox";
import type { InboxProperty } from "@/types/inbox";

interface FocusTriageCardProps {
  property: InboxProperty;
  isDesktop: boolean;
  /** Wide screen (lg): photo left, details right, "Why" open by default. */
  isWide: boolean;
  /**
   * The bottom row: the main button (or status), Skip and More. Built by the
   * window, which owns what each one does; the card only lays it out.
   */
  actions: ReactNode;
}

// ---------------------------------------------------------------------------
// Money numbers are switched off on this card for everybody, super admins
// included. The estimated payback and the revenue simulator both come out of a
// guessed model rather than anything measured, and a confident-looking number
// nobody stands behind is worse than no number. Same call as the financials
// switch-off, for the same reason.
//
// Nothing is deleted. Everything that fed those two numbers is parked in place
// below, marked "off: see header", so switching them back on is a small edit.
// RevenueSimulator.tsx is kept whole; it is just not mounted. Dropping this
// file's imports of it and of the revenue model is what took 8.4 kB off every
// visitor's download, measured. Put them back when the numbers come back.
// The payback figure's slot in the old stats row went when rent and transfer
// became the big numbers; the two helpers below are what it used.
// ---------------------------------------------------------------------------

// off: see header
// function paybackColor(months: number | null | undefined) {
//   if (months == null) return "#dc2626";
//   if (months <= 24) return "#16a34a";
//   if (months <= 36) return "#f59e0b";
//   return "#dc2626";
// }
//
// function paybackLabel(months: number | null | undefined) {
//   if (months == null) return ">99 months";
//   if (months > 99) return ">99 months";
//   return `${months} months`;
// }

/** A big figure with its name in small grey type underneath. */
function Figure({ value, label, transfer = false }: { value: string; label: string; transfer?: boolean }) {
  return (
    <div className="shrink-0">
      {/* Transfer in the map card's transfer orange. */}
      <p className={`poi-price leading-none whitespace-nowrap ${transfer ? "text-orange-700" : ""}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[12px] text-zinc-500">{label}</p>
    </div>
  );
}

export function FocusTriageCard({
  property,
  isDesktop,
  isWide,
  actions,
}: FocusTriageCardProps) {
  // off: see header
  // const [showRevenue, setShowRevenue] = useState(false);
  //
  // const currency = property.source === "sreality" ? "CZK" : "EUR";
  // const defaults = getMarketDefaults(currency);
  // const result = predictRevenue(
  //   3000,
  //   property.price || 30000,
  //   property.size || 60,
  //   defaults,
  // );

  const photos = property.photos || (property.image_url ? [property.image_url] : []);

  const hasFeatures =
    property.hasStorefront || property.hasAirConditioning || property.hasBathroom;

  // Rent and transfer are the two numbers that decide a listing, so they are
  // big, in the map card's price type. Size and rent per m² follow on a quiet
  // line. Per m² is worked out here rather than trusting priceByArea, so it
  // always matches the rent and size beside it.
  const source = property.source === "sreality" ? "sreality" : "idealista";
  const hasPrice = isShown(property.price);
  const quiet = [
    isShown(property.size) ? `${property.size} m²` : null,
    hasPrice && isShown(property.size)
      ? `${formatPrice(property.price / property.size, property.source)} per m²`
      : null,
  ].filter(Boolean).join(" · ");

  return (
    <>
      {/* Two layouts from one tree. Phones and narrow windows stack photo,
          details and buttons in one scrolling column. Wide screens (lg) put
          the photo in a left column and the details in a right column that
          scrolls on its own, with the buttons pinned at its foot. */}

      {/* Photo with district overlay */}
      <div className={`shrink-0 lg:min-h-0 ${PHOTO_COLUMN}`}>
        <ImageCarousel
          photos={photos}
          score={property.aiScore}
          showArrows={isDesktop}
          caption={
            <div
              className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-10"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)",
              }}
            >
              <p
                className="text-white text-base font-medium"
                style={{ fontFamily: "var(--font-outfit)" }}
              >
                {property.district}
              </p>
            </div>
          }
        />
      </div>

      {/* Details column. On narrow screens it is just the rest of the card.
          On wide screens the window's top row sits over its first 48px. */}
      <div className="flex-1 flex flex-col lg:min-h-0 lg:min-w-0 lg:pt-12">
        <div className="px-5 pt-6 pb-4 space-y-6 lg:flex-1 lg:overflow-y-auto lg:px-6 lg:pt-1 lg:space-y-5">
          {/* Money first, then the listing's own links. Two tiers: rent and
              transfer as big figures, each named underneath, side by side on
              every screen; size and rent per m² on a quieter line below. */}
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-7 text-zinc-900">
                {hasPrice ? (
                  <Figure value={formatPrice(property.price, property.source)} label="per month" />
                ) : (
                  <span className="poi-price is-request">On request</span>
                )}
                {isShown(property.transfer) && (
                  <Figure value={formatShortMoney(property.transfer, source)} label="transfer fee" transfer />
                )}
              </div>
              {quiet && (
                <p className="mt-3 text-[13px] text-zinc-500" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {quiet}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <MapsTile
                href={`https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`}
              />
              {property.url && (
                <LinkTile
                  href={property.url}
                  label={source === "sreality" ? "Open on Sreality" : "Open on Idealista"}
                  kind="fill"
                >
                  <img
                    src={source === "sreality" ? "/assets/sreality-logo.png" : "/assets/idealista-logo.png"}
                    alt=""
                  />
                </LinkTile>
              )}
            </div>
          </div>

          {/* AI Summary */}
          {property.aiReason && (
            // The box is its own glow holder: two soft breaths when the card
            // appears. The card remounts per listing, so it breathes once each.
            <BreatheGlow
              playKey={property.id}
              borderRadius={14} // rounded-xl with this theme's --radius
              className="rounded-xl px-4 py-3"
              style={{
                backgroundColor: "rgba(236, 253, 245, 0.6)",
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(16,185,129,0.12)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">
                  AI Summary
                </span>
              </div>
              <p className="text-[13px] text-zinc-700 leading-relaxed">
                {property.aiReason}
              </p>
            </BreatheGlow>
          )}

          {/* AI scout breakdown: "worth a second look" plus the collapsible
              "Why {score}?" reasons. Only listings the scout has rated carry
              one; the rest render exactly as before. Keyed by rating so a
              re-scored listing starts with fresh local state. */}
          {property.aiBreakdown && (
            <AiBreakdown
              key={property.aiBreakdown.ratingId}
              placeId={property.id}
              breakdown={property.aiBreakdown}
              openByDefault={isWide}
            />
          )}

          {/* Features. Only rendered when there is at least one chip: an empty
              row still takes its slot in the space-y-8 stack, which would leave
              a gap of dead white space above the buttons. */}
          {hasFeatures && (
            <div className="flex flex-wrap gap-2">
              {property.hasStorefront && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50">
                  <Store className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-xs text-zinc-500">Storefront</span>
                </div>
              )}
              {property.hasAirConditioning && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50">
                  <Snowflake className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-xs text-zinc-500">AC</span>
                </div>
              )}
              {property.hasBathroom && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50">
                  <Bath className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-xs text-zinc-500">Bathroom</span>
                </div>
              )}
            </div>
          )}

          {/* Revenue simulation toggle. off: see header. */}
          {/*
          <div>
            <button
              onClick={() => setShowRevenue(!showRevenue)}
              className="flex items-center gap-1 text-[13px] text-zinc-400"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  showRevenue ? "rotate-180" : ""
                }`}
              />
              Simulate revenue
            </button>

            {showRevenue && (
              <div className="mt-4">
                <RevenueSimulator property={property} />
              </div>
            )}
          </div>
          */}
        </div>

        {/* The bottom row stays at the foot: sticky on narrow screens, and on
            wide ones a 76px band that lines up with the thumbnail strip. */}
        <div className="sticky bottom-0 mt-auto px-5 pt-3 pb-8 bg-white flex items-center gap-2 lg:static lg:shrink-0 lg:h-[76px] lg:px-6 lg:py-0 lg:border-t lg:border-zinc-100">
          {actions}
        </div>
      </div>
    </>
  );
}
