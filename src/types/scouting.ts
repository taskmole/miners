/**
 * Scouting Trip Types
 *
 * Structure for scouting trips (location pitches) with:
 * - Form-based creation (Lease Decision Brief fields)
 * - Document upload option
 * - Multiple POI/area linking
 * - Comments support
 *
 * localStorage-based for now, designed for easy Supabase migration.
 * Maps to the 'pitches' table in database-migration-prd.md
 */

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

  // Linked POIs and/or areas (multiple supported)
  linkedItems: LinkedItem[];

  // For upload type: the uploaded document
  uploadedDocument?: UploadedDocument;

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
export const SCOUTING_TRIPS_VERSION = 1;

// Default empty trip for form initialization
export function createEmptyTrip(cityId: string, authorName: string = 'Guest'): Omit<ScoutingTrip, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    cityId,
    createdBy: 'guest',
    authorName,
    tripType: 'form',
    status: 'draft',
    name: '',
    linkedItems: [],
    photos: [],
  };
}

// Generate unique ID
export function generateTripId(): string {
  return `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
