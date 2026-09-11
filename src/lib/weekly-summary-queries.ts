/**
 * The shape of the weekly activity summary, and a realistic week of sample
 * data for the preview.
 *
 * Types and sample live beside the queries for the same reason they do in
 * digest-queries.ts: the template renders the same object the database
 * produces, so a field that stops being filled in breaks the build rather
 * than quietly rendering a blank row.
 *
 * The counting functions themselves land here next. Everything below is the
 * contract they have to fill.
 */

/** One city's funnel for the week. Cities with no activity are never included. */
export interface WeeklyCityStats {
  cityId: string;
  /** New rows in `places` from the property feeds only, so cafes are excluded. */
  propertiesAdded: number;
  /** Properties a person actually reviewed in the inbox. */
  triaged: number;
  requested: number;
  /** Scouting trips submitted. Drafts never count. */
  pitched: number;
  requestsApproved: number;
  requestsRejected: number;
  /**
   * Competing requests the app auto-rejected when a rival was approved.
   * Kept out of the rejection count: they are not a human saying no.
   */
  requestsClosedAsDuplicate: number;
  pitchesApproved: number;
  pitchesRejected: number;
  pitchesReturned: number;
}

export interface WeeklyPerson {
  name: string;
  actions: number;
}

export interface WeeklySummaryData {
  /** "5 to 12 September". Built once, so the email never formats dates itself. */
  rangeLabel: string;
  headline: {
    activePeople: number;
    propertiesReviewed: number;
    totalActions: number;
  };
  people: {
    activeCount: number;
    withAccessCount: number;
    /** Sorted most active first. The template caps how many it prints. */
    all: WeeklyPerson[];
    addedThisWeek: string[];
  };
  cities: WeeklyCityStats[];
  /**
   * Company-wide, not per city: the activity log has never recorded which
   * city an action happened in.
   */
  research: {
    savedToLists: number;
    listsCreated: number;
    customPoints: number;
    areasDrawn: number;
    filesUploaded: number;
    comments: number;
  };
  admin: {
    assignmentsMade: number;
    assignmentsRemoved: number;
    joinedTeams: number;
    leftTeams: number;
    usersAdded: number;
  };
  appUrl: string;
}

/**
 * A sample week for the preview.
 *
 * Deliberately fuller than the real first week will be, so every section of
 * the template renders and can be judged. Real production numbers for the
 * last 7 days are roughly a third of this.
 */
export const SAMPLE_WEEKLY_SUMMARY: WeeklySummaryData = {
  rangeLabel: "5 to 12 September",
  headline: { activePeople: 6, propertiesReviewed: 41, totalActions: 88 },
  people: {
    activeCount: 6,
    withAccessCount: 11,
    all: [
      { name: "Matus Husar", actions: 27 },
      { name: "Jaro Zapletal", actions: 21 },
      { name: "Ana Gomez", actions: 16 },
      { name: "Petr Novak", actions: 12 },
      { name: "Lucia Ruiz", actions: 8 },
      { name: "Unknown", actions: 4 },
    ],
    addedThisWeek: ["Lucia Ruiz", "Petr Novak"],
  },
  cities: [
    {
      cityId: "madrid",
      propertiesAdded: 24,
      triaged: 29,
      requested: 5,
      pitched: 2,
      requestsApproved: 3,
      requestsRejected: 1,
      requestsClosedAsDuplicate: 1,
      pitchesApproved: 1,
      pitchesRejected: 0,
      pitchesReturned: 1,
    },
    {
      cityId: "prague",
      propertiesAdded: 11,
      triaged: 12,
      requested: 2,
      pitched: 1,
      requestsApproved: 1,
      requestsRejected: 1,
      requestsClosedAsDuplicate: 0,
      pitchesApproved: 1,
      pitchesRejected: 0,
      pitchesReturned: 0,
    },
  ],
  research: {
    savedToLists: 19,
    listsCreated: 2,
    customPoints: 6,
    areasDrawn: 3,
    filesUploaded: 0,
    comments: 4,
  },
  admin: {
    assignmentsMade: 5,
    assignmentsRemoved: 1,
    joinedTeams: 2,
    leftTeams: 0,
    usersAdded: 2,
  },
  appUrl: "https://theminers.vercel.app",
};
