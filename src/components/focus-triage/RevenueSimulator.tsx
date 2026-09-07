"use client";

import React, { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { predictRevenue, getMarketDefaults } from "@/lib/revenue-model";
import { formatPrice } from "@/types/inbox";
import type { InboxProperty } from "@/types/inbox";

interface RevenueSimulatorProps {
  property: InboxProperty;
}

export function RevenueSimulator({ property }: RevenueSimulatorProps) {
  const currency = property.source === "sreality" ? "CZK" : "EUR";
  const defaults = getMarketDefaults(currency);

  const [traffic, setTraffic] = useState(3000);
  const [captureRate, setCaptureRate] = useState(defaults.captureRate * 100);
  const [avgTicket, setAvgTicket] = useState(defaults.avgTicket);

  const rent = property.price || 0;
  const size = property.size || 0;

  if (!rent || !size) return null;

  const result = predictRevenue(traffic, rent, size, {
    ...defaults,
    captureRate: captureRate / 100,
    avgTicket,
  });

  if (!result) return null;

  const fmt = (n: number) => formatPrice(Math.abs(Math.round(n)), property.source);
  const profitable = result.monthlyEbitda >= 0;

  const paybackText =
    result.paybackMonths == null || result.paybackMonths > 99
      ? ">99 months"
      : `~${result.paybackMonths} months`;

  return (
    <div className="space-y-5">
      {/* Hero: profit + payback */}
      <div className="text-center py-2">
        <p
          className={`text-[22px] font-bold ${profitable ? "text-emerald-600" : "text-red-600"}`}
          style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}
        >
          {profitable ? "" : "-"}{fmt(result.monthlyEbitda)}
          <span className="text-sm font-medium text-zinc-400">/mo</span>
        </p>
        <p className="text-[13px] text-zinc-400 mt-1">
          Pays back {fmt(result.totalInvestment)} buildout in{" "}
          <span className={profitable ? "text-zinc-700 font-medium" : "text-red-500 font-medium"}>
            {paybackText}
          </span>
        </p>
      </div>

      {/* Equation strip */}
      <div>
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          What drives it
        </p>
        <div className="flex items-end gap-1 mb-1">
          <div className="flex-1 text-center">
            <p className="text-[10px] text-zinc-400">Foot traffic</p>
            <p className="text-[15px] font-semibold text-zinc-800" style={{ fontVariantNumeric: "tabular-nums" }}>
              {traffic.toLocaleString("en-US")}
              <span className="text-[10px] text-zinc-400 font-normal">/day</span>
            </p>
          </div>
          <span className="text-zinc-300 text-xs pb-0.5">&times;</span>
          <div className="flex-1 text-center">
            <p className="text-[10px] text-zinc-400">Capture</p>
            <p className="text-[15px] font-semibold text-zinc-800" style={{ fontVariantNumeric: "tabular-nums" }}>
              {captureRate.toFixed(1)}%
            </p>
          </div>
          <span className="text-zinc-300 text-xs pb-0.5">&times;</span>
          <div className="flex-1 text-center">
            <p className="text-[10px] text-zinc-400">Avg ticket</p>
            <p className="text-[15px] font-semibold text-zinc-800" style={{ fontVariantNumeric: "tabular-nums" }}>
              {Math.round(avgTicket)} {currency === "CZK" ? "Kč" : "€"}
            </p>
          </div>
        </div>
        <p
          className="text-[13px] text-zinc-500 text-center mt-1"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          = {fmt(result.monthlyRevenue)} revenue/mo
        </p>
      </div>

      {/* Sliders */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-zinc-400">Foot traffic</span>
            <span className="text-xs font-medium text-zinc-700" style={{ fontVariantNumeric: "tabular-nums" }}>
              {traffic.toLocaleString("en-US")}
            </span>
          </div>
          <Slider min={500} max={20000} step={100} value={[traffic]} onValueChange={([v]) => setTraffic(v)} />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-zinc-400">Capture rate</span>
            <span className="text-xs font-medium text-zinc-700" style={{ fontVariantNumeric: "tabular-nums" }}>
              {captureRate.toFixed(1)}%
            </span>
          </div>
          <Slider min={0.5} max={5} step={0.1} value={[captureRate]} onValueChange={([v]) => setCaptureRate(v)} />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-zinc-400">Avg ticket</span>
            <span className="text-xs font-medium text-zinc-700" style={{ fontVariantNumeric: "tabular-nums" }}>
              {Math.round(avgTicket)} {currency === "CZK" ? "Kč" : "€"}
            </span>
          </div>
          <Slider
            min={currency === "CZK" ? 80 : 3}
            max={currency === "CZK" ? 200 : 10}
            step={currency === "CZK" ? 5 : 0.5}
            value={[avgTicket]}
            onValueChange={([v]) => setAvgTicket(v)}
          />
        </div>
      </div>

      {/* Compact P&L */}
      <div className="bg-zinc-50 rounded-xl px-4 py-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Revenue</span>
          <span className="text-zinc-700 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmt(result.monthlyRevenue)}/mo
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Costs</span>
          <span className="text-zinc-700 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
            {fmt(result.monthlyRevenue - result.monthlyEbitda)}/mo
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">EBITDA</span>
          <span
            className={`font-semibold ${profitable ? "text-emerald-600" : "text-red-600"}`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {profitable ? "" : "-"}{fmt(result.monthlyEbitda)}/mo
          </span>
        </div>
        <div className="border-t border-zinc-200 pt-1.5 mt-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Investment (one-time)</span>
            <span className="text-zinc-700 font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmt(result.totalInvestment)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
