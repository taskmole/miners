export { GlassScoreBadge } from "./GlassScoreBadge";
export { ImageCarousel } from "./ImageCarousel";
// The revenue simulator is switched off on the card, so nothing imports it.
// Parked rather than deleted, with the component itself kept whole.
//
// Note for whoever reads this next: leaving the line live would NOT have cost
// anything. It was measured at 12 bytes across a 4.13 MB bundle, because the
// barrel sits inside the client graph and webpack drops the unreferenced
// re-export. The 8.4 kB that did come out of every visitor's download was the
// direct import of RevenueSimulator and the revenue model in
// FocusTriageCard.tsx. Do not treat commenting out barrel exports as a
// bundle-size tactic here; it does nothing.
// export { RevenueSimulator } from "./RevenueSimulator";
export { FocusTriageCard } from "./FocusTriageCard";
export { AssignSheet } from "./AssignSheet";
export { ActionsSheet } from "./ActionsSheet";
