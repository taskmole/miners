// Shared filter types used across Sidebar, EnhancedMapContainer, and page.tsx

/** Controls which EUCT cafes are shown: all, recently added, or premium only */
export type EuctFilter = "all" | "new" | "premium";

/** Filter properties by when they were first found (created_at) */
export type PropertyPostedFilter = "all" | "last7days" | "over7days";

/** Filter properties by whether they have a transfer fee */
export type PropertyTransferFilter = "all" | "yes" | "no";

/** Filter properties by whether their price changed from the original */
export type PropertyPriceChangeFilter = "all" | "yes" | "no";
