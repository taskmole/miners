"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { ScoutingTripStatus, ChecklistItem } from '@/types/scouting';

/**
 * Pitch data from Supabase for admin view
 * Includes all form fields synced from client
 */
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
  outdoorSeating?: boolean;

  // Other
  risks?: string[];
  checklist?: ChecklistItem[];
  attachmentPaths?: string[];

  // Review info
  rejectionNotes?: string;
  reviewedBy?: string;
}

/**
 * Hook for fetching ALL pitches for admin review
 * Unlike ScoutingTripsContext, this fetches all pitches regardless of creator
 */
export function useAdminSubmissions() {
  const [submissions, setSubmissions] = useState<AdminPitch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch all pitches with user profile info
      const { data, error: fetchError } = await supabase
        .from('pitches')
        .select(`
          *,
          user_profiles:created_by (
            display_name,
            email
          )
        `)
        .in('status', ['submitted', 'approved', 'rejected'])
        .order('submitted_at', { ascending: false, nullsFirst: false });

      if (fetchError) throw fetchError;

      // Transform to AdminPitch format
      const pitches: AdminPitch[] = (data || []).map((row: any) => ({
        id: row.id,
        cityId: row.city_id || 'madrid',
        status: row.status as ScoutingTripStatus,
        createdAt: row.created_at,
        submittedAt: row.submitted_at,
        reviewedAt: row.final_reviewed_at,

        // Author info - try user_profiles first, fall back to stored author_name
        authorName: row.user_profiles?.display_name || row.author_name || 'Unknown',
        authorEmail: row.user_profiles?.email,
        createdBy: row.created_by,

        // Basic info
        name: row.trip_name,
        address: row.address,
        notes: row.condition_notes,

        // Location fields
        areaSqm: row.area_sqm ? Number(row.area_sqm) : undefined,
        storageSqm: row.storage_sqm ? Number(row.storage_sqm) : undefined,
        propertyType: row.property_type,
        footfallEstimate: row.footfall_estimate,
        neighbourhoodProfile: row.neighbourhood_profile,
        nearbyCompetitors: row.nearby_competitors,

        // Financial fields
        monthlyRent: row.monthly_rent ? Number(row.monthly_rent) : undefined,
        serviceFees: row.service_fees ? Number(row.service_fees) : undefined,
        deposit: row.deposit ? Number(row.deposit) : undefined,
        transferFee: row.transfer_fee ? Number(row.transfer_fee) : undefined,
        fitoutCost: row.fitout_cost ? Number(row.fitout_cost) : undefined,
        openingInvestment: row.opening_investment ? Number(row.opening_investment) : undefined,
        expectedDailyRevenue: row.expected_daily_revenue ? Number(row.expected_daily_revenue) : undefined,
        monthlyRevenueRange: row.monthly_revenue_range,
        paybackMonths: row.payback_months,

        // Operational fields
        ventilation: row.ventilation,
        waterWaste: row.water_waste,
        powerCapacity: row.power_capacity,
        visibility: row.visibility,
        deliveryAccess: row.delivery_access,
        seatingCapacity: row.seating_capacity,
        outdoorSeating: row.outdoor_seating,

        // Other
        risks: row.risks,
        checklist: row.checklist,
        attachmentPaths: row.attachment_paths,

        // Review info
        rejectionNotes: row.rejection_notes,
        reviewedBy: row.reviewed_by,
      }));

      setSubmissions(pitches);
      setError(null);
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setError('Failed to load submissions');
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

  // Initial fetch
  useEffect(() => {
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
