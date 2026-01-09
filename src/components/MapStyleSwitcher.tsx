"use client";

import React, { useState, useEffect } from "react";
import { useMap } from "@/components/ui/map";
import { Layers, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES = {
    positron: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    voyager: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
};

export function MapStyleSwitcher() {
    const { map } = useMap();
    const [activeStyle, setActiveStyle] = useState<"positron" | "voyager">("positron");

    // Handle style change
    const handleStyleChange = (styleKey: "positron" | "voyager") => {
        if (!map) return;
        setActiveStyle(styleKey);
        map.setStyle(STYLES[styleKey]);
    };

    return (
        <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center p-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]">
                <button
                    onClick={() => handleStyleChange("positron")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300",
                        activeStyle === "positron"
                            ? "bg-black text-white shadow-md transform scale-105"
                            : "text-zinc-700 hover:text-black hover:bg-white/20"
                    )}
                >
                    <MapIcon className="w-3.5 h-3.5" />
                    Mono
                </button>
                <button
                    onClick={() => handleStyleChange("voyager")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all duration-300",
                        activeStyle === "voyager"
                            ? "bg-blue-600 text-white shadow-md transform scale-105"
                            : "text-zinc-700 hover:text-black hover:bg-white/20"
                    )}
                >
                    <Layers className="w-3.5 h-3.5" />
                    Color
                </button>
            </div>
        </div>
    );
}
