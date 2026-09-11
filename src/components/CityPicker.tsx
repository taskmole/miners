"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { User } from "@supabase/supabase-js";
import { cities, FLAGS, type City } from "@/components/CitySelector";
import { saveDefaultCity } from "@/lib/userPreferences";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";

interface CityPickerProps {
  isVisible: boolean;
  user: User | null;
  onComplete: (city: City) => void;
  /** The cities this person has been granted. Defaults to all of them. */
  available?: City[];
}

export function CityPicker({ isVisible, user, onComplete, available = cities }: CityPickerProps) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const { showToast } = useToast();

  // Offering a city somebody cannot open would make their first action in the
  // product a blank map.
  const activeCities = available.filter(c => c.active);

  const handlePick = async (city: City) => {
    if (submittingId) return;
    setSubmittingId(city.id);

    onComplete(city);

    if (!user) {
      setSubmittingId(null);
      return;
    }

    const result = await saveDefaultCity(user, city.id);
    if (!result.ok) {
      showToast("Couldn't save your choice, you can change it later", "error");
    }
    setSubmittingId(null);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[150] bg-black flex flex-col items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <motion.div
            className="flex flex-col items-center gap-8 w-full max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-semibold text-white">Pick your home city</h1>
              <p className="text-sm text-zinc-400">
                We'll open the map here every time you sign in.
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full">
              {activeCities.map(city => {
                const Flag = FLAGS[city.countryCode];
                const isLoading = submittingId === city.id;
                return (
                  <button
                    key={city.id}
                    onClick={() => handlePick(city)}
                    disabled={submittingId !== null}
                    className={cn(
                      "flex items-center gap-3 w-full px-5 py-4 rounded-xl",
                      "bg-white text-zinc-900 hover:bg-zinc-100 transition-colors",
                      "disabled:opacity-50 disabled:cursor-wait",
                    )}
                  >
                    {Flag && (
                      <span className="w-6 h-[18px] rounded-[3px] overflow-hidden flex-shrink-0">
                        <Flag className="w-full h-full" />
                      </span>
                    )}
                    <span className="text-base font-semibold">{city.name}</span>
                    {isLoading && (
                      <span className="ml-auto text-xs text-zinc-500">Saving…</span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
