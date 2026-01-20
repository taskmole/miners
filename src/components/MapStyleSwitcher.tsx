"use client";

import React, { useState } from "react";
import { useMap } from "@/components/ui/map";
import { cn } from "@/lib/utils";

// Carto basemap style URLs
const STYLES = {
    positron: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    voyager: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
};

// Local thumbnail images for style preview
const TILE_THUMBNAILS = {
    positron: "/assets/map-style-bw.png",
    voyager: "/assets/map-style-color.png",
};

export function MapStyleSwitcher({ onStyleChange }: { onStyleChange?: () => void }) {
    const { map } = useMap();
    const [activeStyle, setActiveStyle] = useState<"positron" | "voyager">("positron");

    // Switch map style when user clicks a thumbnail
    const handleStyleChange = (styleKey: "positron" | "voyager") => {
        if (!map || activeStyle === styleKey) return;
        setActiveStyle(styleKey);
        // diff: true preserves custom layers (clusters, traffic, population)
        map.setStyle(STYLES[styleKey], { diff: true });
        // Wait for style to fully load before signaling change
        // This ensures overlays can be re-added to the new style
        map.once("idle", () => {
            onStyleChange?.();
        });
    };

    return (
        <div className="absolute bottom-6 left-6 z-10">
            {/* Horizontal toggle with glassmorphism */}
            <div className="glass relative flex gap-1.5 p-1 rounded-xl border border-white/40 shadow-[0_0_0_1.5px_rgba(0,0,0,0.3),0_8px_32px_rgba(31,38,135,0.15),inset_0_4px_20px_rgba(255,255,255,0.4)]">
                {/* Sliding white pill indicator */}
                <div
                    className={cn(
                        "absolute top-1 w-7 h-7 rounded-lg bg-white/60 shadow-sm transition-all duration-200 ease-out",
                        activeStyle === "positron" ? "left-1" : "left-[calc(4px+28px+6px)]"
                    )}
                />

                {/* B&W (Positron) thumbnail */}
                <button
                    onClick={() => handleStyleChange("positron")}
                    title="Black & White"
                    className={cn(
                        "relative z-10 w-7 h-7 rounded-lg transition-all duration-200 overflow-hidden shadow-[0_0_0_1.5px_rgba(0,0,0,0.3)]",
                        activeStyle === "positron"
                            ? "shadow-[0_0_0_1.5px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.15)]"
                            : "opacity-50 hover:opacity-80"
                    )}
                >
                    <img
                        src={TILE_THUMBNAILS.positron}
                        alt="B&W map style"
                        className="w-full h-full object-cover"
                    />
                </button>

                {/* Color (Voyager) thumbnail */}
                <button
                    onClick={() => handleStyleChange("voyager")}
                    title="Colorful"
                    className={cn(
                        "relative z-10 w-7 h-7 rounded-lg transition-all duration-200 overflow-hidden shadow-[0_0_0_1.5px_rgba(0,0,0,0.3)]",
                        activeStyle === "voyager"
                            ? "shadow-[0_0_0_1.5px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.15)]"
                            : "opacity-60 saturate-150 hover:opacity-90"
                    )}
                >
                    <img
                        src={TILE_THUMBNAILS.voyager}
                        alt="Colorful map style"
                        className="w-full h-full object-cover"
                    />
                </button>
            </div>
        </div>
    );
}
