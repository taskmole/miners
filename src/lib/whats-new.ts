/**
 * "What's new": the list of product updates, and who gets to see each one.
 *
 * READ THIS BEFORE ADDING AN ENTRY. The repo is public and this file ships in
 * the browser bundle, so anyone can read every entry here, including the ones
 * filtered to AI trainers or super admins. The audience filter decides what
 * the popup SHOWS, it does not keep anything secret. Never write customer
 * data, internal numbers or unannounced plans into an entry.
 *
 * Writing one: a few-word title, written by a person, naming the kind of
 * change ("The UI got a glow up"), not the exact widget ("NEW button
 * glows"). Then one or two plain sentences on what it means for them.
 *
 * Adding an update:
 *   1. Append it at the bottom with the next `id` (ids only ever go up; the
 *      popup remembers "seen up to id N", so reusing or reordering ids would
 *      hide updates from people or show them twice).
 *   2. Screenshots go in public/assets/whats-new/ under a NEW filename every
 *      time. The service worker caches images forever, so overwriting a file
 *      leaves everybody on the old picture.
 */

import { Link as LinkIcon, Zap, type LucideIcon } from "lucide-react";
import {
  canApprove,
  canContribute,
  canTrainAiIn,
  hasCityLevel,
  type Access,
} from "@/lib/permissions";

export type WhatsNewAudience =
  | "everyone"
  | "contributors"
  | "approvers"
  | "ai-trainers"
  | "super-admins";

/** Gradient presets for colour cards, kept few so the popup stays calm. */
export type WhatsNewTone = "peach" | "mint" | "sky" | "lilac";

export type WhatsNewVisual =
  | { kind: "image"; src: string; alt: string }
  | {
      kind: "card";
      tone: WhatsNewTone;
      icon: LucideIcon;
      headline: string;
      subline?: string;
      /** A wide, bare map strip that races past behind the words. For "faster" news. */
      speedBackdrop?: string;
    };

export interface WhatsNewEntry {
  /** Running number. Strictly increasing, never reused. */
  id: number;
  /** Release day, YYYY-MM-DD. Only used for display and the 30-day rule. */
  date: string;
  title: string;
  body: string;
  audience: WhatsNewAudience;
  /** Only people with access to one of these cities see it. Absent = any city. */
  cities?: string[];
  visual: WhatsNewVisual;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: 1,
    date: "2026-10-03",
    title: "The map got 3x faster",
    // ~27 MB less to download on load, and server calls ~1.1 s -> ~0.3 s.
    body: "Less to download and servers right next to the database, so the map is ready about 3x sooner.",
    audience: "everyone",
    visual: {
      kind: "card",
      tone: "sky",
      icon: Zap,
      headline: "3x",
      subline: "faster",
      speedBackdrop: "/assets/whats-new/map-strip-v1.jpg",
    },
  },
  {
    id: 2,
    date: "2026-10-18",
    title: "Share any place",
    body: "Grab a link to any spot and drop it in Slack, WhatsApp or anywhere else. Whoever gets it opens that exact spot.",
    audience: "everyone",
    visual: {
      kind: "image",
      src: "/assets/whats-new/share-chat-v2.jpg",
      alt: "A shared place link in a chat, showing a preview card for Mugshot Coffee",
    },
  },
  {
    id: 3,
    date: "2026-10-18",
    title: "The UI got a glow up",
    body: "Buttons now light up when something new lands, so fresh listings are hard to miss.",
    audience: "everyone",
    visual: {
      kind: "image",
      src: "/assets/whats-new/new-button-glow-v1.jpg",
      alt: "The NEW listings button with a green glow running around its edge",
    },
  },
  {
    id: 4,
    date: "2026-10-18",
    title: "Meet the AI scout",
    body: "Every new listing gets a score with the reasons behind it. Correct a point and the AI learns from you each week. Just for super admins and anyone with \"Can train the AI scout\" on.",
    audience: "ai-trainers",
    visual: {
      kind: "image",
      src: "/assets/whats-new/ai-scout-v3.jpg",
      alt: "A listing's AI summary and Why 86? score, next to the Can train the AI scout switch set to On",
    },
  },
  {
    id: 5,
    date: "2026-10-19",
    title: "Shared links open in a flash",
    body: "A link to a place now opens it in about a second instead of ten, and extra tabs no longer get stuck loading.",
    audience: "everyone",
    visual: {
      kind: "card",
      tone: "mint",
      icon: LinkIcon,
      headline: "1 sec",
      subline: "to open a link",
      speedBackdrop: "/assets/whats-new/map-strip-v1.jpg",
    },
  },
  {
    id: 6,
    date: "2026-10-21",
    title: "Reviewing got easier",
    body: "Requests and pitches now have small, clear Approve and Reject buttons, and the admin dashboard is calmer to work in.",
    audience: "approvers",
    visual: {
      kind: "image",
      src: "/assets/whats-new/admin-review-v1.jpg",
      alt: "A property request with small Reject and Approve buttons next to it",
    },
  },
  {
    id: 7,
    date: "2026-10-22",
    title: "The dashboard got a tidy up",
    body: "Requests now come first, every tab is laid out the same way, and the AI scout tab explains what each part does.",
    audience: "approvers",
    visual: {
      kind: "image",
      src: "/assets/whats-new/admin-tidy-v1.jpg",
      alt: "The admin dashboard's Cafes tab with city buttons and one tidy row per cafe",
    },
  },
];

/** The newest id that exists. Closing the popup marks everything up to here seen. */
export const LATEST_WHATS_NEW_ID = Math.max(0, ...WHATS_NEW.map((e) => e.id));

/** Most slides the popup shows at once. Older unseen ones stay on the page. */
export const MAX_POPUP_SLIDES = 5;

/** A first-time viewer only gets recent news, not the whole history. */
const FIRST_VIEW_WINDOW_DAYS = 30;

function meetsIn(access: Access, audience: WhatsNewAudience, cityId: string): boolean {
  switch (audience) {
    case "everyone":
      return hasCityLevel(access, cityId, "view");
    case "contributors":
      return canContribute(access, cityId);
    case "approvers":
      return canApprove(access, cityId);
    case "ai-trainers":
      return canTrainAiIn(access, cityId);
    case "super-admins":
      return access.isSuperAdmin;
  }
}

/** May this person see this entry? Super admins see everything. */
export function canSeeEntry(entry: WhatsNewEntry, access: Access): boolean {
  if (access.isSuperAdmin) return true;
  const cityIds = entry.cities ?? access.grants.map((g) => g.cityId);
  return cityIds.some((cityId) => meetsIn(access, entry.audience, cityId));
}

/** Every entry this person may see, newest first. Feeds the history page. */
export function visibleEntries(access: Access, entries = WHATS_NEW): WhatsNewEntry[] {
  return entries.filter((e) => canSeeEntry(e, access)).sort((a, b) => b.id - a.id);
}

/**
 * What the popup should show: visible entries newer than `seenId`, newest
 * first, capped. `seenId === null` means they have never closed the popup, so
 * only the last 30 days count, not every update since launch.
 */
export function unseenEntries(
  access: Access,
  seenId: number | null,
  now = new Date(),
  entries = WHATS_NEW,
): WhatsNewEntry[] {
  const cutoff = now.getTime() - FIRST_VIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return visibleEntries(access, entries)
    .filter((e) => (seenId === null ? Date.parse(e.date) >= cutoff : e.id > seenId))
    .slice(0, MAX_POPUP_SLIDES);
}
