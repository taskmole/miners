"use client";

// Design prototype for property triage flow. Delete before committing.

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  MapPin,
  ExternalLink,
  Snowflake,
  Bath,
  Store,
  UserPlus,
  Users,
  Sparkles,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  scoreTier,
  SCORE_TIER_COLORS,
  SCORE_TIER_LABELS,
} from "@/lib/gravity-lookup";
import {
  predictRevenue,
  getMarketDefaults,
} from "@/lib/revenue-model";

// ===========================================
// TYPES
// ===========================================

interface MockProperty {
  id: string;
  name: string;
  address: string;
  district: string;
  source: string;
  price: number;
  size: number;
  url: string;
  image_url?: string;
  photos: string[];
  aiScore?: number;
  aiReason?: string;
  createdAt: string;
  hasBathroom: boolean;
  hasAirConditioning: boolean;
  hasStorefront: boolean;
  transfer?: string;
}

interface MockTeam {
  id: string;
  name: string;
  memberCount: number;
}

interface MockFranchisee {
  id: string;
  name: string;
}

// ===========================================
// MOCK DATA
// ===========================================

const MOCK_LISTINGS: MockProperty[] = [
  {
    id: "p1",
    name: "Kavarna Vinohrady 92 m²",
    address: "Vinohradska 42, Praha 2",
    district: "Vinohrady",
    source: "sreality",
    price: 45000,
    size: 92,
    url: "https://sreality.cz/detail/1",
    image_url:
      "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=800&q=80",
    photos: [
      "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=800&q=80",
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80",
      "https://images.unsplash.com/photo-1493857671505-72967e2e2760?w=800&q=80",
    ],
    aiScore: 91,
    aiReason:
      "Prime corner unit on a busy tram corridor with high pedestrian flow. Ground floor with large display windows facing two streets. Existing cafe fitout reduces buildout costs significantly.",
    createdAt: new Date().toISOString(),
    hasBathroom: true,
    hasAirConditioning: true,
    hasStorefront: true,
    transfer: "50 000 CZK",
  },
  {
    id: "p2",
    name: "Prostor Karlin 78 m²",
    address: "Krizikova 18, Praha 8",
    district: "Karlin",
    source: "sreality",
    price: 38000,
    size: 78,
    url: "https://sreality.cz/detail/2",
    image_url:
      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&q=80",
    photos: [
      "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&q=80",
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80",
    ],
    aiScore: 88,
    aiReason:
      "Located in the revitalized Karlin tech corridor. Strong office-worker foot traffic during weekdays, growing brunch crowd on weekends.",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    hasBathroom: true,
    hasAirConditioning: false,
    hasStorefront: true,
  },
  {
    id: "p3",
    name: "Obchodni prostor Zizkov 55 m²",
    address: "Husitska 10, Praha 3",
    district: "Zizkov",
    source: "sreality",
    price: 28000,
    size: 55,
    url: "https://sreality.cz/detail/3",
    image_url:
      "https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=800&q=80",
    photos: [
      "https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=800&q=80",
    ],
    aiScore: 72,
    aiReason:
      "Decent residential area foot traffic. Near a tram stop but the street is narrow with limited visibility from the main road.",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    hasBathroom: true,
    hasAirConditioning: false,
    hasStorefront: false,
  },
  {
    id: "p4",
    name: "Nebytovy prostor Smichov 110 m²",
    address: "Stroupeznickeho 5, Praha 5",
    district: "Smichov",
    source: "sreality",
    price: 52000,
    size: 110,
    url: "https://sreality.cz/detail/4",
    image_url:
      "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800&q=80",
    photos: [
      "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800&q=80",
      "https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&q=80",
    ],
    aiScore: 52,
    aiReason:
      "Large space but located on a side street behind the Smichov shopping center. Requires significant buildout. Foot traffic is moderate at best.",
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    hasBathroom: false,
    hasAirConditioning: true,
    hasStorefront: true,
  },
  {
    id: "p5",
    name: "Prostor Dejvice 40 m²",
    address: "Evropska 33, Praha 6",
    district: "Dejvice",
    source: "sreality",
    price: 22000,
    size: 40,
    url: "https://sreality.cz/detail/5",
    image_url:
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80",
    photos: [
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80",
    ],
    aiScore: 22,
    aiReason:
      "Too small for a full cafe setup. Basement level with no street-facing windows. Would need extensive ventilation work.",
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    hasBathroom: false,
    hasAirConditioning: false,
    hasStorefront: false,
  },
  {
    id: "p6",
    name: "Komercni prostor Holesovice",
    address: "Komunardu 88, Praha 7",
    district: "Holesovice",
    source: "sreality",
    price: 0,
    size: 65,
    url: "https://sreality.cz/detail/6",
    photos: [],
    aiScore: 15,
    aiReason:
      "No listed rent price. Located in a quiet residential block far from transit. Very low commercial potential.",
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    hasBathroom: false,
    hasAirConditioning: false,
    hasStorefront: false,
  },
];

const MOCK_TEAMS: MockTeam[] = [
  { id: "t1", name: "Prague Central", memberCount: 3 },
  { id: "t2", name: "Prague South", memberCount: 2 },
];

const MOCK_FRANCHISEES: MockFranchisee[] = [
  { id: "u1", name: "Matus K." },
  { id: "u2", name: "Jana H." },
  { id: "u3", name: "Tomas R." },
];

// ===========================================
// UTILITIES
// ===========================================

function dedupTitle(name: string): string {
  return name.replace(/\s+\d+\s*m²\s*$/, "").trim();
}

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

function scoreColor(score: number): string {
  return SCORE_TIER_COLORS[scoreTier(score)];
}

function fmtK(n: number, currency?: string): string {
  const prefix = currency ? `${currency === "CZK" ? "Kc" : "€"}` : "";
  if (Math.abs(n) >= 1000) {
    return `${prefix}${Math.round(n / 1000)}k`;
  }
  return `${prefix}${Math.round(n)}`;
}

// ===========================================
// GLASS SCORE BADGE
// ===========================================

function GlassScoreBadge({ score }: { score: number }) {
  return (
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold"
      style={{
        backgroundColor: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {score}
    </div>
  );
}

// ===========================================
// IMAGE CAROUSEL
// ===========================================

function ImageCarousel({
  photos,
  score,
  showArrows,
}: {
  photos: string[];
  score?: number;
  showArrows?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(idx);
  }, []);

  const scrollTo = useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const next =
      dir === "left"
        ? Math.max(0, activeIndex - 1)
        : Math.min(photos.length - 1, activeIndex + 1);
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }, [activeIndex, photos.length]);

  if (photos.length === 0) {
    const tier = score != null ? scoreTier(score) : "weak";
    const bg =
      tier === "prime"
        ? "from-emerald-800 to-emerald-600"
        : tier === "strong"
        ? "from-amber-700 to-amber-500"
        : tier === "moderate"
        ? "from-zinc-600 to-zinc-400"
        : "from-red-800 to-red-600";
    return (
      <div
        className={`relative w-full aspect-[4/3] bg-gradient-to-br ${bg} flex items-center justify-center`}
      >
        <MapPin className="w-12 h-12 text-white/40" />
        {score != null && (
          <div className="absolute top-3 left-3">
            <GlassScoreBadge score={score} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[4/3]">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex w-full h-full overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: "none" }}
      >
        {photos.map((src, i) => (
          <div key={i} className="w-full h-full flex-shrink-0 snap-center">
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {score != null && (
        <div className="absolute top-3 left-3">
          <GlassScoreBadge score={score} />
        </div>
      )}

      {photos.length > 1 && (
        <div
          className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs text-white font-medium"
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(12px)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {activeIndex + 1}/{photos.length}
        </div>
      )}

      {photos.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {photos.map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{
                backgroundColor:
                  i === activeIndex
                    ? "rgba(255,255,255,0.95)"
                    : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </div>
      )}

      {showArrows && photos.length > 1 && (
        <>
          {activeIndex > 0 && (
            <button
              onClick={() => scrollTo("left")}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-700" />
            </button>
          )}
          {activeIndex < photos.length - 1 && (
            <button
              onClick={() => scrollTo("right")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md"
            >
              <ChevronRight className="w-4 h-4 text-zinc-700" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================
// REVENUE HOOKS & SLIDERS
// ===========================================

function useRevenueEstimate(listing: MockProperty) {
  const defaults = getMarketDefaults("CZK");
  const [state, setState] = useState({
    traffic: 3000,
    captureRate: defaults.captureRate * 100,
    avgTicket: defaults.avgTicket,
  });

  const merged = { ...defaults, captureRate: state.captureRate / 100, avgTicket: state.avgTicket };
  const result = predictRevenue(
    state.traffic,
    listing.price || 30000,
    listing.size || 60,
    merged,
  );

  return {
    state,
    setState,
    result,
    currency: "CZK" as const,
    defaults,
  };
}

function RevenueSliders({
  state,
  onChange,
}: {
  state: { traffic: number; captureRate: number; avgTicket: number };
  onChange: (next: typeof state) => void;
}) {
  const sliders = [
    {
      label: "Daily foot traffic",
      value: state.traffic,
      min: 500,
      max: 20000,
      step: 100,
      format: (v: number) => v.toLocaleString(),
      key: "traffic" as const,
    },
    {
      label: "Capture rate",
      value: state.captureRate,
      min: 0.5,
      max: 5,
      step: 0.1,
      format: (v: number) => `${v.toFixed(1)}%`,
      key: "captureRate" as const,
    },
    {
      label: "Avg ticket (CZK)",
      value: state.avgTicket,
      min: 80,
      max: 200,
      step: 5,
      format: (v: number) => `Kc${Math.round(v)}`,
      key: "avgTicket" as const,
    },
  ];

  return (
    <div className="space-y-4">
      {sliders.map((s) => (
        <div key={s.key}>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-zinc-400">{s.label}</span>
            <span
              className="text-xs font-medium text-zinc-700"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {s.format(s.value)}
            </span>
          </div>
          <Slider
            min={s.min}
            max={s.max}
            step={s.step}
            value={[s.value]}
            onValueChange={([v]) => onChange({ ...state, [s.key]: v })}
          />
        </div>
      ))}
    </div>
  );
}

// ===========================================
// VARIANT B (MAIN COMPONENT)
// ===========================================

function VariantB({
  listings,
  onAction,
  isDesktop,
}: {
  listings: MockProperty[];
  onAction: (id: string, action: string) => void;
  isDesktop: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [actioned] = useState<Set<string>>(new Set());
  const [showDetails, setShowDetails] = useState(false);
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [cardAnim, setCardAnim] = useState<"idle" | "exiting" | "entering">(
    "idle"
  );
  const [toast, setToast] = useState<string | null>(null);
  const [snapshotListing, setSnapshotListing] = useState<MockProperty | null>(
    null
  );

  const listing = snapshotListing ?? listings[currentIndex];
  const revenue = useRevenueEstimate(listing);

  const goNext = useCallback(() => {
    if (currentIndex < listings.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, listings.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const handleAssignWithFeedback = useCallback(
    (name: string) => {
      // 1. Snapshot current card so it doesn't flash new content
      setSnapshotListing(listings[currentIndex]);

      // 2. Close sheet
      setShowAssignPanel(false);

      // 3. Show toast
      setToast(`Assigned to ${name}`);
      setTimeout(() => setToast(null), 2000);

      // 4. Record action
      actioned.add(listings[currentIndex].id);
      onAction(listings[currentIndex].id, `assign:${name}`);

      // 5. After 200ms, start card exit animation
      setTimeout(() => {
        setCardAnim("exiting");
      }, 200);

      // 6. After 550ms total, swap data + entering animation
      setTimeout(() => {
        setSnapshotListing(null);
        if (currentIndex < listings.length - 1) {
          setCurrentIndex((i) => i + 1);
        }
        setCardAnim("entering");
        setShowDetails(false);
      }, 550);

      // 7. After 850ms total, idle
      setTimeout(() => {
        setCardAnim("idle");
      }, 850);
    },
    [currentIndex, listings, actioned, onAction]
  );

  // Card transform based on animation state
  const cardTransform =
    cardAnim === "exiting"
      ? {
          transform: "translateX(-120%) rotate(-8deg)",
          opacity: 0,
          transition: "transform 300ms ease-in, opacity 300ms ease-in",
        }
      : cardAnim === "entering"
      ? {
          transform: "translateX(0)",
          opacity: 1,
          transition: "transform 250ms ease-out, opacity 250ms ease-out",
        }
      : {};

  const paybackColor = (months: number | null | undefined) => {
    if (months == null) return "#dc2626";
    if (months <= 24) return "#16a34a";
    if (months <= 36) return "#f59e0b";
    return "#dc2626";
  };

  const paybackLabel = (months: number | null | undefined) => {
    if (months == null) return ">99mo";
    if (months > 99) return ">99mo";
    return `${months}mo`;
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-600" />
          </button>
          <span
            className="text-sm font-medium text-zinc-500"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {currentIndex + 1} / {listings.length}
          </span>
          <button
            onClick={goNext}
            disabled={currentIndex === listings.length - 1}
            className="w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5 text-zinc-600" />
          </button>
        </div>
        <button className="w-8 h-8 flex items-center justify-center rounded-full">
          <X className="w-5 h-5 text-zinc-400" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full h-[3px] bg-zinc-100">
        <div
          className="h-full bg-zinc-900 transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / listings.length) * 100}%`,
          }}
        />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto flex flex-col" style={cardTransform}>
        {/* Photo overlay */}
        <div className="relative">
          <ImageCarousel
            photos={listing.photos}
            score={listing.aiScore}
            showArrows={isDesktop}
          />
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
              {listing.district} &middot; {listing.size} m&sup2;
            </p>
          </div>
        </div>

        {/* Card content */}
        <div className="px-5 pt-8 pb-4 space-y-8">
          {/* Stats row */}
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-[11px] text-zinc-400 uppercase tracking-wide">
                Rent
              </p>
              <p
                className="text-2xl font-bold text-zinc-900"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                {listing.price > 0
                  ? `${listing.price.toLocaleString("cs-CZ")} Kc`
                  : "N/A"}
              </p>
            </div>
            <div className="flex-1">
              <p className="text-[11px] text-zinc-400 uppercase tracking-wide">
                Est. payback
              </p>
              <p
                className="text-2xl font-bold"
                style={{
                  color: paybackColor(revenue.result?.paybackMonths),
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                {paybackLabel(revenue.result?.paybackMonths)}
              </p>
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                listing.address
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-11 h-11 rounded-xl bg-zinc-100 hover:bg-zinc-200 transition-colors flex items-center justify-center shrink-0"
              style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.04)" }}
            >
              <img
                src="/assets/google-maps-logo-bare.png"
                alt="Google Maps"
                className="w-5 h-5 object-contain"
              />
            </a>
          </div>

          {/* AI Summary */}
          {listing.aiReason && (
            <div
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
                {listing.aiReason}
              </p>
            </div>
          )}

          {/* Features */}
          <div className="flex flex-wrap gap-2">
            {listing.hasStorefront && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50">
                <Store className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs text-zinc-500">Storefront</span>
              </div>
            )}
            {listing.hasAirConditioning && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50">
                <Snowflake className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs text-zinc-500">AC</span>
              </div>
            )}
            {listing.hasBathroom && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-50">
                <Bath className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs text-zinc-500">Bathroom</span>
              </div>
            )}
          </div>

          {/* Revenue simulation toggle */}
          <div>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-[13px] text-zinc-400"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  showDetails ? "rotate-180" : ""
                }`}
              />
              Simulate revenue
            </button>

            {showDetails && revenue.result && (
              <div className="mt-4 space-y-4">
                {/* Revenue equation card */}
                <div className="bg-zinc-50 rounded-xl px-4 py-3">
                  <p
                    className="text-sm font-medium text-zinc-700 mb-3"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmtK(revenue.state.traffic)} &times;{" "}
                    {revenue.state.captureRate.toFixed(1)}% &times; Kc
                    {Math.round(revenue.state.avgTicket)} ={" "}
                    {fmtK(revenue.result.monthlyRevenue, "CZK")}/mo
                  </p>
                  <div className="space-y-1.5">
                    {[
                      {
                        label: "Revenue",
                        value: fmtK(revenue.result.monthlyRevenue, "CZK"),
                      },
                      {
                        label: "Costs",
                        value: fmtK(
                          revenue.result.monthlyRevenue -
                            revenue.result.monthlyEbitda,
                          "CZK"
                        ),
                      },
                      {
                        label: "EBITDA",
                        value: fmtK(revenue.result.monthlyEbitda, "CZK"),
                      },
                      {
                        label: "Investment",
                        value: fmtK(revenue.result.totalInvestment, "CZK"),
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex justify-between text-xs"
                      >
                        <span className="text-zinc-400">{row.label}</span>
                        <span
                          className="text-zinc-700 font-medium"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {row.value}/mo
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sliders */}
                <RevenueSliders
                  state={revenue.state}
                  onChange={revenue.setState}
                />
              </div>
            )}
          </div>
        </div>

        {/* Sticky action buttons */}
        <div className="sticky bottom-0 mt-auto px-5 pt-3 pb-8 bg-white">
          <div className="flex gap-3">
            <button
              onClick={() => {
                onAction(listing.id, "skip");
                goNext();
              }}
              className="flex-[2] py-3.5 rounded-full bg-zinc-100 text-sm font-medium text-zinc-600"
            >
              Next
            </button>
            <button
              onClick={() => setShowAssignPanel(true)}
              className="flex-[3] py-3.5 rounded-full bg-zinc-900 text-sm font-medium text-white"
            >
              Assign
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="absolute top-14 left-1/2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-full shadow-lg z-50"
          style={{
            animation: "fadeInDown 250ms ease-out",
            transform: "translate(-50%, 0)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            {toast}
          </div>
        </div>
      )}

      {/* Assign overlay sheet */}
      {showAssignPanel && (
        <>
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            @keyframes fadeInDown {
              from { opacity: 0; transform: translate(-50%, -8px); }
              to { opacity: 1; transform: translate(-50%, 0); }
            }
          `}</style>

          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 z-40"
            onClick={() => setShowAssignPanel(false)}
          />

          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50"
            style={{ animation: "slideUp 250ms ease-out" }}
          >
            {/* Pill handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-zinc-300" />
            </div>

            <div className="px-6 pt-2 pb-6">
              <h3 className="text-base font-semibold text-zinc-900 mb-4">
                Assign to
              </h3>

              {/* Teams */}
              <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Teams
              </p>
              <div className="space-y-0.5 mb-4">
                {MOCK_TEAMS.map((team) => (
                  <button
                    key={team.id}
                    onClick={() =>
                      handleAssignWithFeedback(team.name)
                    }
                    className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                      <Users className="w-3 h-3 text-blue-600" />
                    </div>
                    <span className="text-sm text-zinc-700 flex-1 text-left">
                      {team.name}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {team.memberCount} members
                    </span>
                  </button>
                ))}
              </div>

              {/* People */}
              <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
                People
              </p>
              <div className="space-y-0.5">
                {MOCK_FRANCHISEES.map((person) => (
                  <button
                    key={person.id}
                    onClick={() =>
                      handleAssignWithFeedback(person.name)
                    }
                    className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                      <UserPlus className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-sm text-zinc-700 flex-1 text-left">
                      {person.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================
// PAGE COMPONENT
// ===========================================

export default function DevTestModalPage() {
  const [viewport, setViewport] = useState<"mobile" | "desktop">("mobile");
  const [actionLog, setActionLog] = useState<
    { id: string; action: string; time: string }[]
  >([]);

  const handleAction = useCallback(
    (id: string, action: string) => {
      setActionLog((prev) => [
        { id, action, time: new Date().toLocaleTimeString() },
        ...prev,
      ]);
    },
    []
  );

  const width = viewport === "mobile" ? 390 : 512;
  const height = viewport === "mobile" ? 844 : 720;

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col items-center py-10 px-4 gap-6">
      {/* Viewport toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setViewport("mobile")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            viewport === "mobile"
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-500"
          }`}
        >
          Mobile (390px)
        </button>
        <button
          onClick={() => setViewport("desktop")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            viewport === "desktop"
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-500"
          }`}
        >
          Desktop (512px)
        </button>
      </div>

      {/* Phone frame */}
      <div
        className="bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{ width, height }}
      >
        <VariantB
          listings={MOCK_LISTINGS}
          onAction={handleAction}
          isDesktop={viewport === "desktop"}
        />
      </div>

      {/* Action log */}
      {actionLog.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Action Log
          </p>
          <div className="flex flex-wrap gap-2">
            {actionLog.map((entry, i) => {
              const isAssign = entry.action.startsWith("assign:");
              return (
                <div
                  key={i}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isAssign
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {entry.action} ({entry.time})
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
