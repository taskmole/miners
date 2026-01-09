"use client";

import React from "react";
import { History, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const logs = [
    { id: 1, text: "Added specialty cafe 'The Miners' in Madrid", time: "2m ago" },
    { id: 2, text: "Updated property price for Calle Gran Via 12", time: "15m ago" },
    { id: 3, text: "Created new 'Business Area' in Malasaña", time: "1h ago" },
];

export function ActivityLog() {
    const [isExpanded, setIsExpanded] = React.useState(false);

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="mb-4 w-72 glass-dark border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                    >
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Activity Log</h3>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-3 h-3 text-white/60" />
                            </button>
                        </div>
                        <div className="p-2 space-y-1">
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    className="p-3 rounded-xl hover:bg-white/5 transition-colors group cursor-default"
                                >
                                    <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
                                        {log.text}
                                    </p>
                                    <span className="text-[9px] font-bold text-zinc-500 mt-1 block">
                                        {log.time.toUpperCase()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    "flex items-center gap-3 px-5 py-3 glass rounded-full hover:bg-white/20 transition-all border-white/40 shadow-lg group",
                    isExpanded && "bg-white/30"
                )}
            >
                <History className={cn("w-4 h-4 text-zinc-900", isExpanded && "animate-spin-slow")} />
                <span className="text-sm font-bold text-zinc-900">ACTIVITY LOG</span>
                <div className="w-5 h-5 bg-zinc-900 text-white text-[10px] flex items-center justify-center rounded-full font-bold">
                    {logs.length}
                </div>
            </button>
        </div>
    );
}
