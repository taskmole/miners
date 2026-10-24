"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { BeamGlow } from "@/components/BeamGlow";
import { LoadingOrb } from "@/components/LoadingOrb";

interface LandingPageProps {
  isVisible: boolean;
  authError?: string | null;
}

export function LandingPage({ isVisible, authError }: LandingPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  // Set once the button has faded in, so its glow starts only when it can be
  // seen.
  const [buttonsIn, setButtonsIn] = useState(false);

  // Pressing Back from Google can bring this page back from the browser's
  // back/forward memory, still showing "Signing in...". Reset the button when
  // that happens.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setIsLoading(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const handleGoogleSignIn = async () => {
    if (!supabase) {
      console.error("Supabase not configured");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    });

    if (error) {
      console.error("Sign in error:", error.message);
      setIsLoading(false);
    }
    // If successful, user will be redirected to Google
  };

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
            onAnimationComplete={() => setButtonsIn(true)}
          >
            {/* Auth Error Message, with a warm pulse once it fades in so it
                gets noticed. Colours held still: the shift drifts into green. */}
            {authError && (
              <BeamGlow
                playKey={buttonsIn ? authError : null}
                playMs={4600}
                size="pulse-inner"
                colorVariant="sunset"
                staticColors
              >
                <div className="px-4 py-2 bg-red-500/20 border border-red-500/30 text-red-300 text-sm rounded-[10px] max-w-xs text-center">
                  {authError}
                </div>
              </BeamGlow>
            )}

            {/* Google Sign In Button: dark, with a light circling its edge
                for as long as the screen is up. Beam clips the browser's own
                focus outline, so the button draws its own just inside its
                edge. */}
            <BeamGlow
              playKey={buttonsIn ? 1 : null}
              size="md"
              colorVariant="colorful"
              theme="dark"
              strength={0.7}
            >
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="flex items-center gap-3 h-12 px-6 rounded-[14px] bg-[#131314] text-[#E3E3E3] ring-1 ring-inset ring-white/15 hover:bg-[#1c1c1e] transition-colors disabled:cursor-wait focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white/80"
              >
                {/* Google icon, swapped for a working orb while signing in */}
                {isLoading ? (
                  <LoadingOrb state="working" onDark />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                )}
                <span className="font-medium">
                  {isLoading ? "Signing in..." : "Continue with Google"}
                </span>
              </button>
            </BeamGlow>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
