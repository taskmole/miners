"use client";

import { useState, useEffect, useSyncExternalStore } from "react";

// Mobile breakpoint - 640px so narrow desktop windows still get side buttons
const MOBILE_BREAKPOINT = 640;

// Hook to detect if viewport is mobile-sized
export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check on mount
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Initial check
    checkMobile();

    // Listen for resize
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

// Matches Tailwind's lg breakpoint, so JS and the lg: classes agree on what
// counts as a wide screen.
const WIDE_QUERY = "(min-width: 1024px)";

// One shared query list, made on first use (window does not exist on the server).
let wideMql: MediaQueryList | null = null;
const wideQuery = () => (wideMql ??= window.matchMedia(WIDE_QUERY));

function subscribeWide(onChange: () => void) {
  const mql = wideQuery();
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

// True on laptop-sized screens and up. False on the server and on first
// hydration, then corrects itself, so it is safe in server-rendered trees.
export function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => wideQuery().matches,
    () => false,
  );
}

// Hook to detect landscape orientation on mobile
export function useLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const checkLandscape = () => {
      // Only consider landscape on mobile-ish screens (height < 500px usually means landscape phone)
      const isLandscapeMobile =
        window.innerWidth > window.innerHeight && window.innerHeight < 500;
      setIsLandscape(isLandscapeMobile);
    };

    checkLandscape();

    window.addEventListener("resize", checkLandscape);
    window.addEventListener("orientationchange", checkLandscape);

    return () => {
      window.removeEventListener("resize", checkLandscape);
      window.removeEventListener("orientationchange", checkLandscape);
    };
  }, []);

  return isLandscape;
}

// Combined hook for mobile detection with orientation
export function useMobileDevice() {
  const isMobile = useMobile();
  const isLandscape = useLandscape();

  return {
    isMobile,
    isLandscape,
    // True if mobile and in landscape orientation
    isMobileLandscape: isMobile && isLandscape,
    // True if mobile and in portrait orientation
    isMobilePortrait: isMobile && !isLandscape,
  };
}
