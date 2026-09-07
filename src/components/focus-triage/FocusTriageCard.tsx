"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  Snowflake,
  Bath,
  Store,
  Sparkles,
} from "lucide-react";
import { predictRevenue, getMarketDefaults } from "@/lib/revenue-model";
import { ImageCarousel } from "./ImageCarousel";
import { RevenueSimulator } from "./RevenueSimulator";
import { formatPrice } from "@/types/inbox";
import type { InboxProperty } from "@/types/inbox";

interface FocusTriageCardProps {
  property: InboxProperty;
  isDesktop: boolean;
  /** Opens the actions menu, which holds every role-specific choice. */
  onActions: () => void;
  /** Moves to the next property without doing anything. */
  onNext: () => void;
}

function paybackColor(months: number | null | undefined) {
  if (months == null) return "#dc2626";
  if (months <= 24) return "#16a34a";
  if (months <= 36) return "#f59e0b";
  return "#dc2626";
}

function paybackLabel(months: number | null | undefined) {
  if (months == null) return ">99 months";
  if (months > 99) return ">99 months";
  return `${months} months`;
}

export function FocusTriageCard({
  property,
  isDesktop,
  onActions,
  onNext,
}: FocusTriageCardProps) {
  const [showRevenue, setShowRevenue] = useState(false);

  const currency = property.source === "sreality" ? "CZK" : "EUR";
  const defaults = getMarketDefaults(currency);
  const result = predictRevenue(
    3000,
    property.price || 30000,
    property.size || 60,
    defaults,
  );

  const photos = property.photos || (property.image_url ? [property.image_url] : []);

  return (
    <>
      {/* Photo with district overlay */}
      <div className="relative">
        <ImageCarousel
          photos={photos}
          score={property.aiScore}
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
            {property.district} &middot; {property.size} m&sup2;
          </p>
        </div>
      </div>

      {/* Card content */}
      <div className="px-5 pt-8 pb-4 space-y-8">
        {/* Stats row: Rent, Payback, link buttons */}
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-zinc-400 uppercase tracking-wide">
              Rent
            </p>
            <p
              className="text-xl font-bold text-zinc-900"
              style={{
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
              }}
            >
              {property.price > 0
                ? formatPrice(property.price, property.source)
                : "N/A"}
            </p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-zinc-400 uppercase tracking-wide">
              Est. payback
            </p>
            <p
              className="text-xl font-bold"
              style={{
                color: paybackColor(result?.paybackMonths),
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
              }}
            >
              {paybackLabel(result?.paybackMonths)}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {property.url && (
              <a
                href={property.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg overflow-hidden"
                style={{
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <img
                  src={property.source === "sreality" ? "/assets/sreality-logo.png" : "/assets/idealista-logo.png"}
                  alt={property.source === "sreality" ? "Sreality" : "Idealista"}
                  className="w-full h-full object-cover"
                />
              </a>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: "#F5F5F5",
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <img
                src="/assets/google-maps-logo-bare.png"
                alt="Google Maps"
                className="w-6 h-6 object-contain"
              />
            </a>
          </div>
        </div>

        {/* AI Summary */}
        {property.aiReason && (
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
              {property.aiReason}
            </p>
          </div>
        )}

        {/* Features */}
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

        {/* Revenue simulation toggle */}
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
      </div>

      {/* Sticky action buttons */}
      <div className="sticky bottom-0 mt-auto px-5 pt-3 pb-8 bg-white">
        {/* Everything a person can do lives behind Action, so the row stays
            the same whoever is looking at it. Skip sits on the right, under
            the thumb, since it is the one pressed most often. */}
        <div className="flex gap-3 items-center">
          <button
            onClick={onActions}
            className="flex-[3] py-3.5 rounded-full bg-zinc-900 text-sm font-medium text-white"
          >
            Action
          </button>
          <button
            onClick={onNext}
            className="flex-[2] py-3.5 rounded-full bg-zinc-100 text-sm font-medium text-zinc-600"
          >
            Skip
          </button>
        </div>
      </div>
    </>
  );
}
