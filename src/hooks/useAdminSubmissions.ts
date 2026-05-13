"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ScoutingTripStatus, ChecklistItem } from '@/types/scouting';

export interface AdminPitch {
  id: string;
  cityId: string;
  status: ScoutingTripStatus;
  createdAt: string;
  submittedAt?: string;
  reviewedAt?: string;

  // Author info
  authorName?: string;
  authorEmail?: string;
  createdBy?: string;

  // Basic info
  name?: string;
  address?: string;
  notes?: string;

  // Location fields
  areaSqm?: number;
  storageSqm?: number;
  propertyType?: string;
  footfallEstimate?: number;
  neighbourhoodProfile?: string;
  nearbyCompetitors?: string;

  // Financial fields
  monthlyRent?: number;
  serviceFees?: number;
  deposit?: number;
  transferFee?: number;
  fitoutCost?: number;
  openingInvestment?: number;
  expectedDailyRevenue?: number;
  monthlyRevenueRange?: string;
  paybackMonths?: number;

  // Operational fields
  ventilation?: string;
  waterWaste?: string;
  powerCapacity?: string;
  visibility?: string;
  deliveryAccess?: string;
  seatingCapacity?: number;
  outdoorSeating?: string;
  flatSurface?: boolean;

  // Other
  risks?: string[];
  checklist?: ChecklistItem[];
  attachmentPaths?: string[];

  // Review info
  rejectionNotes?: string;
  reviewedBy?: string;
}

export function useAdminSubmissions() {
  const [submissions, setSubmissions] = useState<AdminPitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchAttempted = useRef(false);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiFetch<Array<Record<string, unknown>>>('/api/db/pitches?mode=admin');

      const pitches: AdminPitch[] = (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        cityId: (row.city_id as string) || 'madrid',
        status: row.status as ScoutingTripStatus,
        createdAt: row.created_at as string,
        submittedAt: row.submitted_at as string | undefined,
        reviewedAt: row.final_reviewed_at as string | undefined,
        authorName: (row.author_name as string) || 'Unknown',
        authorEmail: undefined,
        createdBy: row.created_by as string | undefined,
        name: row.trip_name as string | undefined,
        address: row.address as string | undefined,
        notes: row.condition_notes as string | undefined,
        areaSqm: row.area_sqm ? Number(row.area_sqm) : undefined,
        storageSqm: row.storage_sqm ? Number(row.storage_sqm) : undefined,
        propertyType: row.property_type as string | undefined,
        footfallEstimate: row.footfall_estimate as number | undefined,
        neighbourhoodProfile: row.neighbourhood_profile as string | undefined,
        nearbyCompetitors: row.nearby_competitors as string | undefined,
        monthlyRent: row.monthly_rent ? Number(row.monthly_rent) : undefined,
        serviceFees: row.service_fees ? Number(row.service_fees) : undefined,
        deposit: row.deposit ? Number(row.deposit) : undefined,
        transferFee: row.transfer_fee ? Number(row.transfer_fee) : undefined,
        fitoutCost: row.fitout_cost ? Number(row.fitout_cost) : undefined,
        openingInvestment: row.opening_investment ? Number(row.opening_investment) : undefined,
        expectedDailyRevenue: row.expected_daily_revenue ? Number(row.expected_daily_revenue) : undefined,
        monthlyRevenueRange: row.monthly_revenue_range as string | undefined,
        paybackMonths: row.payback_months as number | undefined,
        ventilation: row.ventilation as string | undefined,
        waterWaste: row.water_waste as string | undefined,
        powerCapacity: row.power_capacity as string | undefined,
        visibility: row.visibility as string | undefined,
        deliveryAccess: row.delivery_access as string | undefined,
        seatingCapacity: row.seating_capacity as number | undefined,
        outdoorSeating: typeof row.outdoor_seating === 'boolean'
          ? (row.outdoor_seating ? 'street' : undefined)
          : row.outdoor_seating as string | undefined,
        flatSurface: row.flat_surface as boolean | undefined,
        risks: row.risks as string[] | undefined,
        checklist: row.checklist as ChecklistItem[] | undefined,
        attachmentPaths: row.attachment_paths as string[] | undefined,
        rejectionNotes: row.rejection_notes as string | undefined,
        reviewedBy: row.reviewed_by as string | undefined,
      }));

      setSubmissions(pitches);
    } catch (err: unknown) {
      console.error('[useAdminSubmissions] Error fetching submissions:', err);

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('401') || errorMessage.includes('JWT') || errorMessage.includes('auth')) {
        setError('Authentication error, please try signing in again');
      } else if (errorMessage.includes('permission') || errorMessage.includes('RLS')) {
        setError('Permission denied, admin access required');
      } else {
        setError(`Failed to load submissions: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Get submissions by status
  const getByStatus = useCallback((status: ScoutingTripStatus): AdminPitch[] => {
    return submissions.filter(s => s.status === status);
  }, [submissions]);

  // Get pending (submitted) submissions
  const pending = getByStatus('submitted');

  // Get processed (approved + rejected) submissions
  const processed = submissions.filter(s => s.status === 'approved' || s.status === 'rejected');

  // Fetch on mount (only once)
  useEffect(() => {
    if (fetchAttempted.current) return;
    fetchAttempted.current = true;
    fetchSubmissions();
  }, [fetchSubmissions]);

  return {
    submissions,
    pending,
    processed,
    loading,
    error,
    refetch: fetchSubmissions,
    getByStatus,
  };
}
