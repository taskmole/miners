"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMobile } from "@/hooks/useMobile";
import { useUserProfiles } from "@/hooks/useUserProfiles";
import { BottomSheet } from "@/components/ui/bottom-sheet";

export function ProfileMenu() {
  const isMobile = useMobile();
  const router = useRouter();
  const { canAccessDashboard } = useUserProfiles();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => setIsOpen(false), []);

  const handleNavigate = useCallback((path: string) => {
    setIsOpen(false);
    router.push(path);
  }, [router]);

  // Close on click outside (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isMobile, handleClose]);

  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, isMobile, handleClose]);

  const menuItems = (
    <>
      {canAccessDashboard && (
        <button
          onClick={() => handleNavigate("/admin")}
          className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-black/5 active:bg-black/10 transition-colors"
        >
          Admin Dashboard
        </button>
      )}
      <button
        onClick={() => handleNavigate("/user-guide")}
        className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-black/5 active:bg-black/10 transition-colors"
      >
        User Guide
      </button>
    </>
  );

  return (
    <>
      {/* Avatar button - desktop: bottom-right above feedback, mobile: top-right */}
      <div
        ref={menuRef}
        className="fixed z-40 right-4 md:bottom-4"
        style={isMobile ? { top: "calc(24px + env(safe-area-inset-top, 0px))" } : undefined}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="glass flex items-center justify-center p-2.5 rounded-2xl md:w-9 md:h-9 md:p-0 md:rounded-lg md:border md:border-white/40 hover:bg-white/20 active:bg-white/30 transition-all duration-200"
          aria-label="Profile menu"
        >
          <User className="w-5 h-5 md:w-[18px] md:h-[18px] text-zinc-500" />
        </button>

        {/* Desktop dropdown - opens upward */}
        {!isMobile && isOpen && (
          <div
            className="absolute bottom-full right-0 mb-2 w-52 rounded-2xl overflow-hidden"
            style={{
              background: "rgba(255, 255, 255, 0.75)",
              borderColor: "rgba(255, 255, 255, 0.4)",
              backdropFilter: "blur(16px) saturate(180%)",
              boxShadow:
                "0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          >
            {menuItems}
          </div>
        )}
      </div>

      {/* Mobile bottom sheet */}
      {isMobile && (
        <BottomSheet
          isOpen={isOpen}
          onClose={handleClose}
          snapPoint="auto"
          showCloseButton
        >
          <div className="px-2 pb-4">
            {menuItems}
          </div>
        </BottomSheet>
      )}
    </>
  );
}
