"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface LandingPageProps {
  isVisible: boolean;
  onEnterDemo: () => void;
}

export function LandingPage({ isVisible, onEnterDemo }: LandingPageProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {/* Logo with blur-to-focus and move-up animation */}
          <motion.div
            className="flex flex-col items-center"
            initial={{
              scale: 1.8,
              filter: "blur(20px)",
              opacity: 0,
              y: 0
            }}
            animate={{
              scale: 1,
              filter: "blur(0px)",
              opacity: 1,
              y: -40
            }}
            transition={{
              scale: { duration: 2.0, ease: [0.22, 1, 0.36, 1], delay: 0.3 },
              filter: { duration: 1.2, ease: "easeOut" },
              opacity: { duration: 0.8, ease: "easeOut" },
              y: { duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 1.0 }
            }}
          >
            <div className="w-[60vw] max-w-[600px] overflow-hidden">
              <Image
                src="/assets/THEMINERS_LOGO_WHITE_UP (3).png"
                alt="THEMINERS"
                width={600}
                height={200}
                className="w-full h-auto scale-[1.02] -my-[5px]"
                priority
              />
            </div>
          </motion.div>

          {/* Buttons container - fades in after logo settles */}
          <motion.div
            className="flex flex-col items-center gap-4 mt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              ease: "easeOut",
              delay: 2.4
            }}
          >
            {/* Google Sign In Button (disabled) */}
            <div className="relative">
              <button
                disabled
                className="flex items-center gap-3 px-6 py-3 bg-zinc-800 text-zinc-500 rounded-lg cursor-not-allowed transition-none"
              >
                {/* Google Icon */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#9CA3AF"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#6B7280"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#6B7280"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#9CA3AF"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="font-medium">Continue with Google</span>
              </button>

              {/* Coming Soon chip */}
              <div className="absolute -top-2 -right-4 px-2 py-0.5 bg-emerald-500/30 text-emerald-300 text-xs font-medium rounded-full">
                Coming soon
              </div>
            </div>

            {/* Demo Button */}
            <Button
              variant="ghost"
              onClick={onEnterDemo}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800/50 text-sm"
            >
              Go to Demo
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
