/**
 * Scouting Trip Types
 *
 * Structure for scouting trips (location pitches) with:
 * - Form-based creation (Lease Decision Brief fields)
 * - Document upload option
 * - Single main property focus with optional related places
 * - Attachments (photos, documents)
 * - Questions checklist for on-site use
 * - Comments support
 *
 * localStorage-based for now, designed for easy Supabase migration.
 * Maps to the 'pitches' table in database-migration-prd.md
 */

import { Attachment } from './attachments';

// Status of a scouting trip
export type ScoutingTripStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

// Type of trip creation
export type ScoutingTripType = 'form' | 'upload';

// Linked item (POI or drawn area)
export interface LinkedItem {
  type: 'place' | 'area';
  id: string;
  name: string;
  address?: string; // For POIs that have an address
  data?: any; // Full POI object for fast navigation (avoids O(n) search)
}

// Uploaded document reference
export interface UploadedDocument {
  id: string;
  name: string;
  type: string; // MIME type (application/pdf, etc.)
  size: number;
  data: string; // Base64 encoded
  uploadedAt: string;
}

// Checklist item for on-site questions
export interface ChecklistItem {
  id: string;
  question: string;
  isChecked: boolean;
  notes: string;
  isDefault: boolean; // true for default questions, false for user-added
}

// Photo attachment (reuses existing attachment pattern)
export interface ScoutingPhoto {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // Base64 encoded
  thumbnail?: string; // Base64 encoded thumbnail
  uploadedAt: string;
}

// Dropdown options for form fields
export type PropertyType = 'retail' | 'office' | 'mixed' | 'other';
export type ConditionStatus = 'ok' | 'needs_upgrade' | 'complex';
export type VisibilityLevel = 'strong' | 'medium' | 'weak';
export type AccessLevel = 'good' | 'average' | 'bad';

// Main scouting trip interface
export interface ScoutingTrip {
  id: string;
  cityId: string; // madrid, barcelona, prague
  createdBy: string; // User ID (guest for now)
  authorName: string; // Display name
  tripType: ScoutingTripType;
  status: ScoutingTripStatus;

  // Name/title for the trip
  name: string;

  // Main property being scouted (ONE property per trip)
  property: LinkedItem | null;

  // Related places for context (from list, not the main focus)
  relatedPlaces: LinkedItem[];

  // Checklist of questions for on-site use
  checklist: ChecklistItem[];

  // Attachments (photos, documents, etc.)
  attachments: Attachment[];

  // For upload type: the uploaded document
  uploadedDocument?: UploadedDocument;

  // Legacy field for migration (will be removed after migration)
  linkedItems?: LinkedItem[];

  // ===== FORM FIELDS (Lease Decision Brief) =====

  // Location Section
  address?: string;
  areaSqm?: number;
  storageSqm?: number;
  propertyType?: PropertyType;
  footfallEstimate?: number;
  neighbourhoodProfile?: string;
  nearbyCompetitors?: string;

  // Financial Section
  monthlyRent?: number;
  serviceFees?: number;
  deposit?: number;
  transferFee?: number; // One-time license transfer cost (traspaso)
  fitoutCost?: number;
  openingInvestment?: number;
  expectedDailyRevenue?: number;
  monthlyRevenueRange?: string;
  paybackMonths?: number;

  // Operational Section
  ventilation?: ConditionStatus;
  waterWaste?: ConditionStatus;
  powerCapacity?: ConditionStatus;
  visibility?: VisibilityLevel;
  deliveryAccess?: AccessLevel;
  seatingCapacity?: number;
  outdoorSeating?: boolean;

  // Other Section
  risks?: string;
  photos: ScoutingPhoto[];

  // ===== METADATA =====

  // Rejection feedback (when status is 'rejected')
  rejectionNotes?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

// localStorage structure
export interface ScoutingTripsState {
  version: number;
  trips: ScoutingTrip[];
}

// Storage constants
export const SCOUTING_TRIPS_STORAGE_KEY = 'miners-scouting-trips';
export const SCOUTING_TRIPS_VERSION = 2; // Bumped for new data structure

// Default placeholder questions (user will supply real questions later)
export const DEFAULT_CHECKLIST_QUESTIONS = [
  'What is the overall condition of the space?',
  'Is the rent within budget?',
  'How is the natural lighting?',
  'Is the location visible from the street?',
  'How is the foot traffic in the area?',
  'Are there parking/delivery access options?',
  'What renovations would be needed?',
  'Who are the neighboring businesses?',
  'Is the landlord responsive?',
  'Any concerns or red flags?',
];

// Create default checklist items from questions
export function createDefaultChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST_QUESTIONS.map((question, index) => ({
    id: `default_${index}`,
    question,
    isChecked: false,
    notes: '',
    isDefault: true,
  }));
}

// Default empty trip for form initialization
export function createEmptyTrip(cityId: string, authorName: string = 'Guest'): Omit<ScoutingTrip, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    cityId,
    createdBy: 'guest',
    authorName,
    tripType: 'form',
    status: 'draft',
    name: '',
    property: null,
    relatedPlaces: [],
    checklist: createDefaultChecklist(),
    attachments: [],
    photos: [],
  };
}

// Generate unique ID
export function generateTripId(): string {
  return `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Migrate old trip format (linkedItems) to new format (property + relatedPlaces)
export function migrateTrip(trip: ScoutingTrip): ScoutingTrip {
  // If already migrated (has property field set or explicitly null), skip
  if (trip.property !== undefined || trip.relatedPlaces !== undefined) {
    // Ensure arrays exist
    return {
      ...trip,
      relatedPlaces: trip.relatedPlaces || [],
      checklist: trip.checklist || createDefaultChecklist(),
      attachments: trip.attachments || [],
    };
  }

  // Migrate from linkedItems
  const linkedItems = trip.linkedItems || [];
  const firstItem = linkedItems.length > 0 ? linkedItems[0] : null;
  const otherItems = linkedItems.slice(1);

  return {
    ...trip,
    property: firstItem,
    relatedPlaces: otherItems,
    checklist: trip.checklist || createDefaultChecklist(),
    attachments: trip.attachments || [],
    linkedItems: undefined, // Remove legacy field
  };
}

// Status display helpers
export const statusLabels: Record<ScoutingTripStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const statusColors: Record<ScoutingTripStatus, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// Property type labels
export const propertyTypeLabels: Record<PropertyType, string> = {
  retail: 'Retail',
  office: 'Office',
  mixed: 'Mixed Use',
  other: 'Other',
};

// Condition status labels
export const conditionLabels: Record<ConditionStatus, string> = {
  ok: 'OK',
  needs_upgrade: 'Needs Upgrade',
  complex: 'Complex',
};

// Visibility labels
export const visibilityLabels: Record<VisibilityLevel, string> = {
  strong: 'Strong',
  medium: 'Medium',
  weak: 'Weak',
};

// Access labels
export const accessLabels: Record<AccessLevel, string> = {
  good: 'Good',
  average: 'Average',
  bad: 'Bad',
};
