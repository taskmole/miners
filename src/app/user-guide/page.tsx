"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useUserProfiles } from "@/hooks/useUserProfiles";

// Role labels for the badge
const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super Admin",
  head_office_exec: "Head Office",
  finance_reviewer: "Finance Reviewer",
  area_coordinator: "Area Coordinator",
  franchisee: "Franchisee",
};

export default function UserGuidePage() {
  const router = useRouter();
  const { currentUserRole, canAccessDashboard, canReviewSubmissions, isAdmin, loading } =
    useUserProfiles();

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Sticky header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10" style={{ paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-2 -ml-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-600" />
          </button>
          <BookOpen className="w-5 h-5 text-zinc-400" />
          <h1 className="text-lg font-bold text-zinc-900">User Guide</h1>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Intro + role badge */}
        <div>
          <p className="text-sm text-zinc-600">
            Everything you need to know about using Location Scout.
          </p>
          {!loading && currentUserRole && (
            <p className="text-xs text-zinc-400 mt-1">
              Your role:{" "}
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium">
                {ROLE_DISPLAY[currentUserRole] || currentUserRole}
              </span>
            </p>
          )}
        </div>

        {/* ===== SECTION 1: Getting Around the Map ===== */}
        <GuideSection title="Getting Around the Map">
          <GuideAccordion
            items={[
              {
                q: "How do I move on the map?",
                a: "Hold and drag to move. Scroll up/down to zoom. On your phone, use two fingers to zoom.",
              },
              {
                q: "How do I change the city?",
                a: "Tap the city name in the top-left corner. You only see the cities your admin gave you access to.",
              },
              {
                q: "How do I change how the map looks?",
                a: "Tap the small map icon in the bottom-left corner. You can pick a simple black-and-white look or a colorful one.",
              },
              {
                q: "What is the Location Score?",
                a: "A number that tells you how good a location is. It looks at things like how many people walk by, how close public transport is, and what\u2019s nearby. Higher = better. Still in testing.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 2: Filters and Data Layers ===== */}
        <GuideSection title="Filters and Data Layers">
          <GuideAccordion
            items={[
              {
                q: "How do I show or hide places on the map?",
                a: 'Open Filters and check or uncheck the types of places you want to see. You can also tap "Select All" or "Clear All."',
              },
              {
                q: 'What does "New" mean?',
                a: "It shows places that were added recently. Tap it to quickly find new data.",
              },
              {
                q: "What is the Traffic Layer?",
                a: "Turn it on to see how many people walk on each street. Move the time slider to see traffic at different times of the day.",
              },
              {
                q: "What are the Population and Income layers?",
                a: "They color the map to show where more people live or where income is higher. Use the sliders to set a minimum level.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 3: Drawing on the Map ===== */}
        <GuideSection title="Drawing on the Map">
          <GuideAccordion
            items={[
              {
                q: "How do I draw a shape?",
                a: 'Open Draw tools. Pick "Area" and click on the map to set the corners of your shape. Double-click the last corner to finish.',
              },
              {
                q: "How do I drop a pin?",
                a: 'Open Draw tools, pick "Point," then click anywhere on the map to place it.',
              },
              {
                q: "What can I do after I draw something?",
                a: "Right-click it (on a phone: press and hold). You can rename it, change its color, write comments, attach files, or see area stats.",
              },
              {
                q: "What are custom categories?",
                a: 'You can make your own pin types, like "Visited" or "Maybe." Then you can drop pins using those labels.',
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 4: Place Details ===== */}
        <GuideSection title="Place Details">
          <GuideAccordion
            items={[
              {
                q: "How do I see info about a place?",
                a: "Tap any pin on the map. A popup shows the name, address, rating, and a link to open it in Google Maps.",
              },
              {
                q: "How do I hide a place?",
                a: 'Tap the pin, then tap the eye icon to hide it. To bring it back, turn on "Show Hidden" in Filters.',
              },
              {
                q: "Can I add a comment?",
                a: "Yes. Tap a pin, scroll down, and type your comment. Everyone on your team can read it.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 5: Lists ===== */}
        <GuideSection title="Lists">
          <GuideAccordion
            items={[
              {
                q: "How do I make a list?",
                a: 'Open the Lists panel and tap "New List." Then, when you tap any pin on the map, you can add it to your list.',
              },
              {
                q: "What can I do with a list?",
                a: "You can rename it, drag items to change the order, write notes, and download it as a spreadsheet (CSV) or PDF.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 6: Scouting Trips ===== */}
        <GuideSection title="Scouting Trips">
          <GuideAccordion
            items={[
              {
                q: "What is a Scouting Trip?",
                a: "A report about a real location. You add details about the property, photos, and documents. Then you send it to the head office for review.",
              },
              {
                q: "How do I start a new trip?",
                a: 'Open the Scouting panel and tap "New Trip." Fill in each section. You can save it as a draft and finish later.',
              },
              {
                q: "How do I send my trip for review?",
                a: 'When your trip is ready, tap "Submit." It goes to the head office. You will see the status change to Submitted, then later to Approved or Rejected.',
              },
              {
                q: "How do I connect map locations to a trip?",
                a: 'In the trip form, tap "Link Locations." A dark bar appears at the top. Tap the pins or shapes you want to include, then tap "Done."',
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 7: Activity Log ===== */}
        <GuideSection title="Activity Log">
          <GuideAccordion
            items={[
              {
                q: "What is the Activity Log?",
                a: "A list of recent things your team did \u2014 like adding comments, changing lists, or submitting trips. Tap any item to go to that place on the map.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 8: Using on Your Phone ===== */}
        <GuideSection title="Using on Your Phone">
          <GuideAccordion
            items={[
              {
                q: "Where are the menus on mobile?",
                a: "Use the bar at the bottom of the screen. It has buttons for Filters, Draw, Lists, and Scouting. Swipe a panel down to close it.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== DASHBOARD SECTION (Coordinator+) ===== */}
        {canAccessDashboard && (
          <GuideSection title="Admin Dashboard">
            <GuideAccordion
              items={[
                {
                  q: "How do I open the Admin Dashboard?",
                  a: 'Tap the "Admin Dashboard" button at the bottom of the Filters panel. It opens a new page.',
                },
                {
                  q: "What is in the Dashboard?",
                  a: "You can see all scouting trips your team submitted. Each one shows its status: Submitted, Approved, or Rejected. You can also download any trip as a PDF.",
                },
              ]}
            />
          </GuideSection>
        )}

        {/* ===== REVIEW SECTION (Head Office + Super Admin) ===== */}
        {canReviewSubmissions && (
          <GuideSection title="Reviewing Submissions">
            <GuideAccordion
              items={[
                {
                  q: "How do I approve or reject a trip?",
                  a: 'Open the trip in the Admin Dashboard. Read the details. Then tap "Approve" or "Reject." If you reject it, write a short reason so the person knows why.',
                },
              ]}
            />
          </GuideSection>
        )}

        {/* ===== ADMIN SECTION (Super Admin only) ===== */}
        {isAdmin && (
          <GuideSection title="Managing Users">
            <GuideAccordion
              items={[
                {
                  q: "How do I change someone\u2019s role?",
                  a: 'Go to the Admin Dashboard and open the "User Roles" tab. Find the person and pick a new role from the list. The change works right away.',
                },
                {
                  q: "What does each role do?",
                  a: "Franchisee \u2014 can use the map, make lists, and send scouting trips. Coordinator / Finance \u2014 same, plus they can see the Admin Dashboard. Head Office \u2014 same, plus they can approve or reject trips. Super Admin \u2014 can do everything, including managing users.",
                },
                {
                  q: "How do I turn off a user\u2019s access?",
                  a: 'In the "User Roles" tab, find the person and turn off the switch next to their name. They will not be able to log in until you turn it back on.',
                },
              ]}
            />
          </GuideSection>
        )}
      </main>
    </div>
  );
}

// ─── Helper components ───────────────────────────────────────

/** A titled card section */
function GuideSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-zinc-900 mb-2">{title}</h2>
      <div className="bg-white rounded-lg border border-zinc-200 px-4">
        {children}
      </div>
    </div>
  );
}

/** Renders an accordion from a list of Q&A pairs */
function GuideAccordion({
  items,
}: {
  items: { q: string; a: string }[];
}) {
  return (
    <Accordion type="multiple">
      {items.map((item, i) => (
        <AccordionItem key={i} value={`item-${i}`}>
          <AccordionTrigger>{item.q}</AccordionTrigger>
          <AccordionContent>
            <p className="text-sm text-zinc-600">{item.a}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
