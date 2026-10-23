"use client";

/**
 * Pieces every card shares: the open step, notes, the Share / Save /
 * Notes & files / Hide items with their steps, the facts line, and the
 * bodies for the smaller second steps (Saved lists, Pre-reject).
 */
import React from "react";
import { Bookmark, Check, Eye, EyeOff, MessageSquare, Paperclip, Plus, Share } from "lucide-react";
import { useListsContext } from "@/contexts/ListsContext";
import { useHiddenPoisContext } from "@/contexts/HiddenPoisContext";
import { useToast } from "@/contexts/ToastContext";
import type { PlaceInfo } from "@/types/lists";
import { cn } from "@/lib/utils";
import { scoreTier, SCORE_TIER_COLORS } from "@/lib/gravity-lookup";
import { Tip, type MoreItem, type PoiStep } from "./PoiCard";
import { usePlaceNotes, NotesFilesBody, NotesComposer, type PlaceNotes } from "./NotesFilesView";
import { ageLong, ageShort } from "./card-format";
import { sharePlace, type SharePlace } from "./share";

/**
 * State every card keeps, and the More items and steps they all offer.
 * Each card picks its items in its own order and adds its own on top.
 */
export function usePlaceCard({ place, notesType, share, subtitle }: {
  place: PlaceInfo;
  /** Attachments type: "property", "cafe", "metro"… */
  notesType: string;
  share: SharePlace;
  /** Under each step's title: what this place is. */
  subtitle: string;
}) {
  const { isHidden, toggleHidden } = useHiddenPoisContext();
  const { showToast } = useToast();
  const [step, setStep] = React.useState<string | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  const notes = usePlaceNotes(place.placeId, { placeName: place.placeName, placeType: notesType, lat: place.lat, lon: place.lon });
  const savedCount = useSavedCount(place.placeId);
  const hidden = isHidden(place.placeId);

  const items = {
    share: {
      key: "share", label: "Share", icon: <Share aria-hidden />, onSelect: () => sharePlace(share, showToast),
    },
    // "Save", or "Saved" with "2 lists" beside it.
    save: {
      key: "saved", label: savedCount ? "Saved" : "Save", icon: <Bookmark aria-hidden />, count: savedCount,
      opensStep: true, onSelect: () => setStep("saved"),
    },
    notes: {
      key: "notes", label: "Notes & files", icon: <MessageSquare aria-hidden />, count: notes.count ? String(notes.count) : null,
      opensStep: true, onSelect: () => setStep("notes"),
    },
    // After a thin line in every menu.
    hide: {
      key: "hide", label: hidden ? "Unhide" : "Hide", icon: hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />,
      separatorBefore: true, onSelect: () => toggleHidden(place.placeId),
    },
  } satisfies Record<string, MoreItem>;

  const steps: Record<string, PoiStep> = {
    notes: {
      title: "Notes & files",
      subtitle,
      body: <NotesFilesBody notes={notes} />,
      footer: <NotesComposer notes={notes} text={noteDraft} setText={setNoteDraft} />,
    },
    saved: { title: "Save to a list", subtitle, body: <SavedListsBody place={place} /> },
  };

  return { step, setStep, notes, hidden, items, steps };
}

/**
 * The chip top left: "82 BETA · 3d ago", just "3d ago" without a score, plus
 * "· Hidden" when hidden. The score is the AI scout's. Its tooltip spells it
 * out, with the AI's one-line reason on a line of its own.
 */
export function AgeChip({ date, hidden, score = null, reason }: {
  date?: string;
  hidden: boolean;
  score?: number | null;
  reason?: string;
}) {
  const text = [ageShort(date), hidden ? "Hidden" : null].filter(Boolean).join(" · ");
  if (score === null && !text) return null;
  const tip = [
    [score !== null ? `AI score ${score}/100, still in beta` : null, ageLong(date)].filter(Boolean).join(" · "),
    score !== null ? reason : null,
  ].filter(Boolean).join("\n") || null;
  return (
    <Tip text={tip} className="poi-gchip">
      {score !== null && (
        <>
          <span className="poi-score" style={{ background: SCORE_TIER_COLORS[scoreTier(score)] }}>{score}</span>
          <span className="beta-mark">BETA</span>
        </>
      )}
      {text && <small>{score !== null ? `· ${text}` : text}</small>}
    </Tip>
  );
}

/** Quiet note and file counts on the right of a row; opens Notes & files. */
export function NotesCount({ notes, onOpen }: { notes: PlaceNotes; onOpen: () => void }) {
  if (notes.count === 0) return null;
  return (
    <button type="button" className="poi-counts" onClick={onOpen} aria-label={`Notes and files: ${notes.count}`}>
      {notes.comments.length > 0 && <span className="poi-cnt"><MessageSquare aria-hidden />{notes.comments.length}</span>}
      {notes.files.length > 0 && <span className="poi-cnt"><Paperclip aria-hidden />{notes.files.length}</span>}
    </button>
  );
}

/** "95 m² · Storefront · A/C"; wraps to a second line when it must. */
export function FactList({ facts }: { facts: string[] }) {
  return (
    <span className="poi-facts is-list">
      {/* Each fact stays whole; a long line wraps between facts, never inside one. */}
      {facts.map((f, i) => (
        <React.Fragment key={f}>
          {i > 0 && " "}
          <span className="poi-fact">{f}{i < facts.length - 1 && <i aria-hidden>·</i>}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

/** How many of my lists hold this place, for the More menu: "2 lists". */
function useSavedCount(placeId: string): string | null {
  const { writableLists, isPlaceInList } = useListsContext();
  const n = writableLists.filter((l) => isPlaceInList(placeId, l.id)).length;
  if (n === 0) return null;
  return n === 1 ? "1 list" : `${n} lists`;
}

/**
 * A tick per list, plus a field for a new one. Only lists I can write to
 * (someone else's read-only list must never be a save target). Enter on a
 * new name creates the list and ticks it.
 */
function SavedListsBody({ place }: { place: PlaceInfo }) {
  const { writableLists, toggleInList, isPlaceInList, createList } = useListsContext();
  const [name, setName] = React.useState("");

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const list = createList(trimmed);
    toggleInList(list.id, place);
    setName("");
  };

  return (
    <div className="poi-lists">
      {writableLists.length === 0 && <p className="poi-empty">No lists yet. Name one below.</p>}
      {writableLists.map((list) => {
        const on = isPlaceInList(place.placeId, list.id);
        return (
          <button
            key={list.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            className={cn("poi-list-row", on && "is-on")}
            onClick={() => toggleInList(list.id, place)}
          >
            <span className="poi-check" aria-hidden>{on && <Check />}</span>
            <span className="poi-list-name">{list.name}</span>
          </button>
        );
      })}
      <div className="poi-new-list">
        <Plus aria-hidden />
        <input
          type="text"
          className="poi-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { e.preventDefault(); create(); }
          }}
          placeholder="New list"
          aria-label="New list name"
        />
      </div>
    </div>
  );
}

/**
 * The reason field for Pre-reject. Enter or the button confirms. The text
 * lives in the card, so it survives Back on the same pin.
 */
export function PreRejectForm({ reason, setReason, busy, onConfirm }: {
  reason: string;
  setReason: (r: string) => void;
  busy: boolean;
  onConfirm: (reason: string) => void;
}) {
  const submit = () => {
    if (reason.trim() && !busy) onConfirm(reason.trim());
  };
  return (
    <div className="poi-reason">
      <input
        type="text"
        className="poi-input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); submit(); }
        }}
        placeholder="Reason, e.g. too small"
        aria-label="Reason for pre-rejecting"
        autoFocus
      />
      <button type="button" className="poi-btn is-danger" onClick={submit} disabled={!reason.trim() || busy}>
        Pre-reject
      </button>
    </div>
  );
}
