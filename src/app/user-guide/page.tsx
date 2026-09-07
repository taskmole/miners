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
            How to use Location Scout.
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
                a: "Hold and drag to move. Scroll to zoom. On your phone, use two fingers to zoom.",
              },
              {
                q: "How do I change the city?",
                a: "Tap the city name in the top-left corner. Then pick a city.",
              },
              {
                q: "How do I change how the map looks?",
                a: "Tap the small map icon in the bottom-left corner. Pick black-and-white or color.",
              },
              {
                q: "What is the Location Score?",
                a: "A number from 0 to 100. It shows how good a location is. Higher is better. It is still in testing.",
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
                a: "Open Filters. Tick the types of places you want to see.",
              },
              {
                q: 'What does "New" mean?',
                a: "Places added in the last days.",
              },
              {
                q: "What is the Min. Score slider?",
                a: "It hides properties with a low score. Example: set it to 60. Now you only see properties with score 60 or more.",
              },
              {
                q: "What does the Status filter (All / Mine / Scouted) do?",
                a: (
                  <>
                    "Mine" shows only your properties. "Scouted" shows properties that
                    already have a trip. The numbers show how many are on the map.
                    <GuideImage src="/assets/guide/filters-status.png" alt="The Filters panel. The Min. Score slider and the Status row are marked in red." />
                  </>
                ),
              },
              {
                q: "What is the Traffic Layer?",
                a: "It shows how many people walk on each street. Move the time slider to see other times of day.",
              },
              {
                q: "What are the Population and Income layers?",
                a: "They color the map. Darker color = more people, or higher income.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 3: New Property Listings (triage deck) ===== */}
        <GuideSection title="New Property Listings">
          <GuideAccordion
            items={[
              {
                q: "What is the NEW button?",
                a: (
                  <>
                    It opens the newest properties we found for your city. Best properties
                    come first. A red dot means there is something new for you.
                    <GuideImage src="/assets/guide/triage-card.png" alt="A property card. The score, payback time, and Action button are marked in red." />
                  </>
                ),
              },
              {
                q: "What do I see on each property card?",
                a: "Photos. The AI score (top-left). Rent. Payback time (green = fast, red = slow). A short AI note about the location. Links to the listing and Google Maps.",
              },
              {
                q: "What do Skip and Skip all do?",
                a: '"Skip" moves to the next property. "Skip all" closes the whole batch. Nothing is deleted. The properties stay on the map.',
              },
              {
                q: "What is the Action button?",
                a: (
                  <>
                    It opens a menu with all things you can do. The menu changes based on
                    your role. If a button is missing, read the small grey text at the top.
                    It tells you why.
                    <GuideImage src="/assets/guide/actions-sheet.png" alt="The Actions menu with the action list marked in red." />
                  </>
                ),
              },
              {
                q: "What does the grey text in the Actions menu mean?",
                a: '"Assigned to [name]" = the property belongs to someone. "Waiting for a reviewer" = your request was sent. "Already scouted" = a trip exists for it. "Pre-rejected" = head office said no to this property.',
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 4: Simulate Revenue ===== */}
        <GuideSection title="Simulate Revenue">
          <GuideAccordion
            items={[
              {
                q: "What is Simulate revenue?",
                a: (
                  <>
                    A simple calculator on each property card. It shows how much money a
                    cafe there could make each month. It also shows how fast it pays back
                    the building cost.
                    <GuideImage src="/assets/guide/revenue-simulator.png" alt="The revenue simulator with three sliders and a profit summary." />
                  </>
                ),
              },
              {
                q: "What do the three sliders mean?",
                a: '"Foot traffic" = people walking by per day. "Capture rate" = how many of them buy something (2% = 2 of 100 people). "Avg ticket" = how much one customer pays.',
              },
              {
                q: "How do I read the numbers?",
                a: "Revenue = people x capture rate x ticket. EBITDA = profit per month. Green = profit. Red = loss. Payback = how many months to earn back the investment.",
              },
              {
                q: "Where do the starting numbers come from?",
                a: "Head office sets them for each city. Moving the sliders changes nothing for other people. It is only a test for you.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 5: Requesting a Property ===== */}
        <GuideSection title="Requesting a Property">
          <GuideAccordion
            items={[
              {
                q: "How do I request a property?",
                a: 'Open the property. Tap "Actions", then "Request this property". Head office gets an email.',
              },
              {
                q: "What happens after I request?",
                a: "You wait for head office. If they approve: the property is yours, and you get an email. If they say no: you get an email with the reason. You cannot request it again.",
              },
              {
                q: "Why can I not request some properties?",
                a: "Because someone else has it, or it already has a trip, or head office rejected it. The grey text in the Actions menu tells you which one.",
              },
              {
                q: "When can I create a scouting trip?",
                a: 'Only on your properties. When a property is yours, the "Create trip" button appears.',
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 6: Drawing on the Map ===== */}
        <GuideSection title="Drawing on the Map">
          <GuideAccordion
            items={[
              {
                q: "How do I draw a shape?",
                a: 'Open Draw tools. Pick "Area". Click on the map to set the corners. Double-click to finish.',
              },
              {
                q: "How do I drop a pin?",
                a: 'Open Draw tools. Pick "Point". Click on the map.',
              },
              {
                q: "What can I do after I draw something?",
                a: "Right-click it (on a phone: press and hold). You can rename it, change its color, write comments, or add files.",
              },
              {
                q: "What are custom categories?",
                a: 'Your own pin types, like "Visited" or "Maybe".',
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 7: Place Details ===== */}
        <GuideSection title="Place Details">
          <GuideAccordion
            items={[
              {
                q: "How do I see info about a place?",
                a: "Tap any pin on the map. A popup opens with name, address, and a Google Maps link.",
              },
              {
                q: "How do I hide a place?",
                a: 'Tap the pin, then the eye icon. To see it again, turn on "Show Hidden" in Filters.',
              },
              {
                q: "Can I add a comment?",
                a: "Yes. Tap a pin, scroll down, and write. Your team can read it.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 8: Lists ===== */}
        <GuideSection title="Lists">
          <GuideAccordion
            items={[
              {
                q: "How do I make a list?",
                a: 'Open the Lists panel. Tap "New List". Then tap any pin and add it to the list.',
              },
              {
                q: "What can I do with a list?",
                a: "Rename it. Change the order. Write notes. Download it as a spreadsheet (CSV) or PDF.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 9: Scouting Trips ===== */}
        <GuideSection title="Scouting Trips">
          <GuideAccordion
            items={[
              {
                q: "What is a Scouting Trip?",
                a: "A report about one property. You add details, photos, and documents. Then you send it to head office.",
              },
              {
                q: "How do I start a new trip?",
                a: 'Tap "Create trip" on your property. Or open the Scouting panel and tap "New Trip". You can save a draft and finish later.',
              },
              {
                q: "How do I send my trip for review?",
                a: 'Tap "Submit". After that you cannot edit it. You get an email when head office decides.',
              },
              {
                q: "What do the trip statuses mean?",
                a: "Draft = only you see it. Submitted = waiting for review. Returned = fix it and send again. Approved = accepted. Rejected = no, with a reason.",
              },
              {
                q: "My trip was returned. What now?",
                a: 'Open the trip. Read the note from the reviewer. Tap "Edit Trip", fix it, and tap "Submit" again.',
              },
              {
                q: "How do I connect map locations to a trip?",
                a: 'In the trip form, tap "Link Locations". Tap the pins or shapes you want. Then tap "Done".',
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 10: Emails ===== */}
        <GuideSection title="Emails You Get">
          <GuideAccordion
            items={[
              {
                q: "When does the app email me?",
                a: "When you get a property. When your request is approved or rejected. When your trip is approved, rejected, or returned. When your team has news.",
              },
              {
                q: "What is the new-listings email?",
                a: "An email with the best new properties. It comes a few times a week. Your admin turns it on or off for you.",
              },
              {
                q: "I get no emails. What do I check?",
                a: 'Check your spam folder. The sender is "Miners Scout". Still nothing? Ask your admin to check your settings.',
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 11: Activity Log ===== */}
        <GuideSection title="Activity Log">
          <GuideAccordion
            items={[
              {
                q: "What is the Activity Log?",
                a: "A list of what your team did: comments, lists, trips. Tap an item to jump to it on the map.",
              },
            ]}
          />
        </GuideSection>

        {/* ===== SECTION 12: Using on Your Phone ===== */}
        <GuideSection title="Using on Your Phone">
          <GuideAccordion
            items={[
              {
                q: "Where are the menus on mobile?",
                a: "Use the bar at the bottom: Filters, Draw, Lists, Scouting, and NEW. Swipe a panel down to close it.",
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
                  a: 'Tap your profile picture, then "Admin Dashboard".',
                },
                {
                  q: "What is in the Dashboard?",
                  a: "Tabs: Pitches (trips to review), Requests, Cafes, Inputs, Users, Teams. A red number means items are waiting for you.",
                },
              ]}
            />
          </GuideSection>
        )}

        {/* ===== REVIEWER SECTIONS (Head Office + Super Admin) ===== */}
        {canReviewSubmissions && (
          <>
          <GuideSection title="Triaging and Assigning Properties">
            <GuideAccordion
              items={[
                {
                  q: "How do I assign a property?",
                  a: 'Open the property. Tap "Actions", then "Assign to...". Pick a person or a team. They get an email.',
                },
                {
                  q: "What is Pre-reject?",
                  a: 'It means: nobody should scout this property. Write a short reason and confirm. Franchisees will not see it anymore. To undo it, open the property and tap "Undo pre-reject".',
                },
                {
                  q: "Why can I not assign a property that is already assigned?",
                  a: 'First tap "Remove assignment". Then assign it to someone else. This protects the current owner.',
                },
              ]}
            />
          </GuideSection>

          <GuideSection title="Reviewing Property Requests">
            <GuideAccordion
              items={[
                {
                  q: "Where do requests show up?",
                  a: (
                    <>
                      Admin Dashboard, "Requests" tab. You also get an email for each new
                      request.
                      <GuideImage src="/assets/guide/requests-tab.png" alt="The Requests tab. The tab and the Approve and Reject buttons are marked in red." />
                    </>
                  ),
                },
                {
                  q: "What happens when I approve a request?",
                  a: "The property goes to that person. They get an email. Other requests for the same property are auto-rejected. Only Super Admins can decide. You cannot decide your own request.",
                },
                {
                  q: "What happens when I reject a request?",
                  a: "You must write a reason. The person gets it by email. They cannot request that property again.",
                },
              ]}
            />
          </GuideSection>

          <GuideSection title="Reviewing Submissions">
            <GuideAccordion
              items={[
                {
                  q: "How do I review a submitted trip?",
                  a: (
                    <>
                      Admin Dashboard, "Pitches" tab. Open the trip and read it. Then pick:
                      "Approve", "Return for Edits" (they fix it and send again), or
                      "Reject" (final). For Return and Reject you must write a short note.
                      <GuideImage src="/assets/guide/pitches-review.png" alt="A submission. The Approve, Return for Edits, and Reject buttons are marked in red." />
                    </>
                  ),
                },
                {
                  q: "Who is told about my decision?",
                  a: "The person who sent the trip gets an email with your note. If it is a team trip, the team is told too.",
                },
              ]}
            />
          </GuideSection>
          </>
        )}

        {/* ===== SUPER ADMIN SECTIONS ===== */}
        {isAdmin && (
          <>
          <GuideSection title="Email Notifications for Users">
            <GuideAccordion
              items={[
                {
                  q: "How do I turn on property alert emails for someone?",
                  a: (
                    <>
                      Admin Dashboard, "Users" tab. Click the person. Turn on "Property
                      Alert Emails". Tick their cities. Tap "Save Changes".
                      <GuideImage src="/assets/guide/user-notifications.png" alt="User settings. The city choices and the Property Alert Emails switch are marked in red." />
                    </>
                  ),
                },
                {
                  q: "What do the city choices do?",
                  a: "The person only gets emails for the cities you tick. No city ticked = all cities. Inactive users get no emails.",
                },
                {
                  q: "When do these emails go out?",
                  a: "After each scraper run, a few times a week, early in the morning. No new properties = no email.",
                },
              ]}
            />
          </GuideSection>

          <GuideSection title="Market Inputs">
            <GuideAccordion
              items={[
                {
                  q: "What is the Inputs tab for?",
                  a: "It sets the starting numbers for the revenue calculator: footfall, conversion, average ticket, and building cost. Per city. Change them here and every property card uses your new numbers.",
                },
              ]}
            />
          </GuideSection>

          <GuideSection title="Managing Users">
            <GuideAccordion
              items={[
                {
                  q: "How do I add or change a user?",
                  a: 'Admin Dashboard, "Users" tab. "Add User" makes a new profile. They finish by signing in with Google. Click any user to change their role, team, cities, or emails.',
                },
                {
                  q: "What does each role do?",
                  a: "Franchisee: map, lists, requests, trips. Coordinator / Finance: also sees the Dashboard. Head Office: also reviews trips. Super Admin: everything, including requests and users.",
                },
                {
                  q: "How do I turn off someone's access?",
                  a: 'Open the user. Turn off the "Active" switch. They cannot log in and get no emails.',
                },
              ]}
            />
          </GuideSection>
          </>
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

/** A screenshot inside an answer. Hidden automatically if the file 404s. */
function GuideImage({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="mt-3 w-full max-w-md rounded-lg border border-zinc-200"
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

/** Renders an accordion from a list of Q&A pairs */
function GuideAccordion({
  items,
}: {
  items: { q: string; a: React.ReactNode }[];
}) {
  return (
    <Accordion type="multiple">
      {items.map((item, i) => (
        <AccordionItem key={i} value={`item-${i}`}>
          <AccordionTrigger>{item.q}</AccordionTrigger>
          <AccordionContent>
            <div className="text-sm text-zinc-600">{item.a}</div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
