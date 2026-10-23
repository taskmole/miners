"use client";

/**
 * The shell every map pin card is built from (listings, cafes, other places).
 *
 * Order, top to bottom: photo (or a plain header), the card's own body, then
 * one bottom row. Second steps (Notes & files, Assign, Saved lists, …) replace
 * the whole card with a back arrow, one level deep: Back always returns to
 * the card, never to a menu.
 *
 * The same card renders in three places: the desktop pin popup, the desktop
 * popup for clusters/lists/links, and the phone bottom sheet. Phone layout
 * differences are CSS only (see `.poi-card` in globals.css); the card finds
 * out which it is in by looking for the sheet's scroll area.
 */
import React from "react";
import { ArrowLeft, MoreHorizontal, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PhotoStrip } from "./PhotoStrip";

// ── Card context: lets the menu and buttons close the card ──

export interface PoiCardApi {
  close: () => void;
  /** Photo on screen; open tooltips close when it changes. */
  photoIndex: number;
}

const PoiCardContext = React.createContext<PoiCardApi | null>(null);

export function usePoiCard(): PoiCardApi {
  const ctx = React.useContext(PoiCardContext);
  if (!ctx) throw new Error("usePoiCard must be used inside a PoiCard");
  return ctx;
}

// ── Building blocks ─────────────────────────────────────────────────────

export interface MoreItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Gets the card, e.g. to close it before opening the trip form. */
  onSelect: (card: PoiCardApi) => void;
  /** Small grey count on the right, e.g. "3" notes or "2 lists". */
  count?: string | null;
  /** "danger" is red. */
  tone?: "danger";
  /** Draw a thin line above this item. */
  separatorBefore?: boolean;
  /** Opens a second step, which takes focus for its own field. */
  opensStep?: boolean;
}

/** The ⋯ button and its menu. Same dropdown on desktop and phone. */
export function MoreMenu({ items }: { items: MoreItem[] }) {
  const card = usePoiCard();
  const toStep = React.useRef(false);
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => { if (open) toStep.current = false; }}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="poi-ib" aria-label="More actions">
          <MoreHorizontal aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="poi-more"
        // Focus goes back to ⋯, except when a step opened: it focuses its
        // own field, and ⋯ is no longer on screen.
        onCloseAutoFocus={(e) => { if (toStep.current) e.preventDefault(); }}
      >
        {items.map((item) => (
          <React.Fragment key={item.key}>
            {item.separatorBefore && <DropdownMenuSeparator className="poi-more-sep" />}
            <DropdownMenuItem
              className={cn("poi-more-item", item.tone && `is-${item.tone}`)}
              onSelect={() => { toStep.current = !!item.opensStep; item.onSelect(card); }}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count && <span className="poi-more-count">{item.count}</span>}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A chip or pill with one glass tooltip. Hover opens it with a mouse; a tap
 * toggles it on touch. Closes on an outside tap or when the photos move.
 */
export function Tip({
  text,
  children,
  className,
  place = "below",
}: {
  text: string | null;
  children: React.ReactNode;
  className?: string;
  place?: "below" | "above";
}) {
  const { photoIndex } = usePoiCard();
  const [open, setOpen] = React.useState(false);
  const pointer = React.useRef<string>("mouse");
  const ref = React.useRef<HTMLSpanElement>(null);
  const descId = React.useId();

  React.useEffect(() => setOpen(false), [photoIndex]);

  React.useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  if (!text) return <span className={className}>{children}</span>;

  return (
    <span
      ref={ref}
      className={cn("poi-tip-anchor", className)}
      role="button"
      tabIndex={0}
      aria-describedby={descId}
      onPointerDown={(e) => { pointer.current = e.pointerType; }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setOpen(false); }}
      onClick={(e) => {
        e.stopPropagation();
        if (pointer.current !== "mouse") setOpen((o) => !o);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
      }}
    >
      {children}
      {/* Always in the page for screen readers; shown when open. */}
      <span id={descId} className="sr-only">{text}</span>
      {open && <span className={cn("poi-tip", `is-${place}`)} aria-hidden>{text}</span>}
    </span>
  );
}

/** The black main button. Gets the card, like More items do. */
export function MainButton({ label, onPress, disabled }: {
  label: string;
  onPress: (card: PoiCardApi) => void;
  disabled?: boolean;
}) {
  const card = usePoiCard();
  return (
    <button type="button" className="poi-main" onClick={() => onPress(card)} disabled={disabled}>
      <span>{label}</span>
    </button>
  );
}

/** A square logo or icon link in the bottom row. */
export function LinkTile({
  href,
  label,
  kind,
  children,
}: {
  href: string;
  label: string;
  /** "fill": logo covers the tile. "bg": logo sits on grey. "glyph": an icon. */
  kind: "fill" | "bg" | "glyph";
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("poi-tile", `is-${kind}`)} aria-label={label} title={label}>
      {children}
    </a>
  );
}

/** Every card's Google Maps tile. */
export function MapsTile({ href }: { href: string }) {
  return (
    <LinkTile href={href} label="Open in Google Maps" kind="bg">
      <img src="/assets/google-maps-logo-bare.png" alt="" />
    </LinkTile>
  );
}

// ── Steps ───────────────────────────────────────────────────────────────

export interface PoiStep {
  title: string;
  subtitle?: string;
  body: React.ReactNode;
  /** Stays at the bottom while the body scrolls, e.g. a note composer. */
  footer?: React.ReactNode;
}

// ── The shell ───────────────────────────────────────────────────────────

export interface PoiCardProps {
  onClose?: () => void;
  /** Photos for the strip. Empty means no photo. */
  photos?: string[];
  photoAlt: string;
  /** No photos: show a grey block anyway (listings), instead of a white header. */
  placeholder?: boolean;
  /** Left of the close button: score, freshness, category… */
  chips: React.ReactNode;
  /** Laid on the photo (white text), or under the header when there is none. */
  headline: React.ReactNode;
  /** Everything between the headline and the bottom row. */
  body?: React.ReactNode;
  /** The bottom row. */
  actions: React.ReactNode;
  /** Second steps by name; the card opens one by setting `step`. */
  steps?: Record<string, PoiStep>;
  /** Name of the step to open, set by the card; null = the card. */
  step: string | null;
  onStepChange: (step: string | null) => void;
}

export function PoiCard({
  onClose, photos = [], photoAlt, placeholder, chips, headline, body, actions,
  steps = {}, step, onStepChange,
}: PoiCardProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // Kept here, not in the strip, so Back from a step returns to the same photo.
  const [photoIndex, setPhotoIndex] = React.useState(0);
  const current = step ? steps[step] : null;

  const close = React.useCallback(() => {
    // The desktop pin popup is only removed by this event; onClose alone
    // just clears the selection and leaves it on screen.
    rootRef.current?.dispatchEvent(new CustomEvent("closePopup", { bubbles: true }));
    onClose?.();
  }, [onClose]);

  const back = React.useCallback(() => onStepChange(null), [onStepChange]);

  const api = React.useMemo<PoiCardApi>(
    () => ({ close, photoIndex }),
    [close, photoIndex],
  );

  // Desktop: never run past the bottom of the map, so the bottom row stays
  // reachable. Auto-pan only runs when the card opens, so a taller step
  // (Assign, Notes) has to fit below wherever the card already sits.
  React.useLayoutEffect(() => {
    const el = rootRef.current;
    const map = el?.closest(".maplibregl-map") as HTMLElement | null;
    if (!el || !map) return;
    const fit = () => {
      // On open, only the map's height: auto-pan then moves the map so the
      // card fits. Measuring the room below the pin here would shrink the
      // card before auto-pan gets a chance.
      const cap = map.clientHeight - 40;
      const room = step ? map.getBoundingClientRect().bottom - el.getBoundingClientRect().top - 16 : cap;
      el.style.maxHeight = `${Math.max(240, Math.min(room, cap))}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(map);
    return () => ro.disconnect();
    // A step renders a new root element, which needs the cap too.
  }, [step]);

  // A new view starts at its top, in the sheet and in the desktop card.
  React.useEffect(() => {
    const sheet = rootRef.current?.closest("[data-sheet-scroll]");
    sheet?.scrollTo({ top: 0 });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step]);

  // Escape: inside a step it means Back. On desktop, on the card, it closes.
  // The phone sheet closes itself, and skips keys used here.
  React.useEffect(() => {
    const inSheet = !!rootRef.current?.closest("[data-sheet-scroll]");
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Escape in a field elsewhere (search, a shape comment) is not for us.
      const target = e.target as HTMLElement | null;
      const outside = !rootRef.current?.contains(target);
      if (outside && target?.closest("input, textarea, [contenteditable='true'], [role='dialog']")) return;
      if (step) {
        e.preventDefault();
        back();
      } else if (!inSheet) {
        close();
      }
    };
    // Capture for steps, so Back wins over the sheet closing. Bubble on the
    // card, so an open menu closes first and this sees it as used.
    const capture = !!step;
    document.addEventListener("keydown", onKey, capture);
    return () => document.removeEventListener("keydown", onKey, capture);
  }, [step, back, close]);

  const closeButton = (
    <button type="button" className="poi-x" onClick={(e) => { e.stopPropagation(); close(); }} aria-label="Close">
      <X aria-hidden />
    </button>
  );

  if (current) {
    return (
      <PoiCardContext.Provider value={api}>
        <div ref={rootRef} className="poi-card is-step">
          <span className="poi-grab" aria-hidden />
          <div className="poi-step-head">
            <button type="button" className="poi-back" onClick={back} aria-label="Back">
              <ArrowLeft aria-hidden />
            </button>
            <div className="poi-step-title">
              <div className="poi-step-name">{current.title}</div>
              {current.subtitle && <div className="poi-step-sub">{current.subtitle}</div>}
            </div>
            {closeButton}
          </div>
          <div ref={scrollRef} className="poi-scroll poi-step-body">{current.body}</div>
          {current.footer && <div className="poi-step-foot">{current.footer}</div>}
        </div>
      </PoiCardContext.Provider>
    );
  }

  const hasPhotos = photos.length > 0;
  const showTop = hasPhotos || placeholder;

  return (
    <PoiCardContext.Provider value={api}>
      <div ref={rootRef} className={cn("poi-card", !showTop && "no-top")}>
        <span className={cn("poi-grab", showTop && "is-on-photo")} aria-hidden />
        {showTop ? (
          <div className="poi-top">
            {hasPhotos ? (
              <PhotoStrip
                photos={photos}
                alt={photoAlt}
                index={photoIndex}
                onIndex={setPhotoIndex}
              />
            ) : (
              <div className="poi-photo-missing" aria-hidden />
            )}
            <div className="poi-scrim" aria-hidden />
            {/* Close comes first in the DOM, so the map's focus-on-open lands
                on it rather than on a chip; CSS puts it on the right. */}
            <div className="poi-overlay">
              {closeButton}
              <div className="poi-chips">{chips}</div>
            </div>
            <div className="poi-headline is-on-photo">{headline}</div>
          </div>
        ) : (
          <div className="poi-head">
            {closeButton}
            <div className="poi-chips">{chips}</div>
          </div>
        )}
        <div ref={scrollRef} className="poi-scroll">
          {!showTop && <div className="poi-headline">{headline}</div>}
          {body}
        </div>
        <div className="poi-bar">{actions}</div>
      </div>
    </PoiCardContext.Provider>
  );
}
