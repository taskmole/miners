"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { ScoutingTripStatus, ChecklistItem } from '@/types/scouting';
import type { User } from '@supabase/supabase-js';

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
  const [authReady, setAuthReady] = useState(false);
  const fetchAttempted = useRef(false);

  // Wait for auth to be ready before fetching
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }

    // Check current auth state
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setAuthReady(true);
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setAuthReady(true);
      } else if (event === 'SIGNED_OUT') {
        setAuthReady(false);
        setSubmissions([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchSubmissions = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }

    // Check if user is authenticated first
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[useAdminSubmissions] No authenticated user, skipping fetch');
      setError('Please sign in to view submissions');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[useAdminSubmissions] Fetching submissions...');

      // Fetch all pitches (author_name is stored directly in pitches table)
      const { data, error: fetchError } = await supabase
        .from('pitches')
        .select('*')
        .in('status', ['submitted', 'approved', 'rejected'])
        .order('submitted_at', { ascending: false, nullsFirst: false });

      if (fetchError) {
        console.error('[useAdminSubmissions] Supabase error:', fetchError);
        throw fetchError;
      }

      console.log('[useAdminSubmissions] Fetched', data?.length || 0, 'submissions');

      // Transform to AdminPitch format
      const pitches: AdminPitch[] = (data || []).map((row: any) => ({
        id: row.id,
        cityId: row.city_id || 'madrid',
        status: row.status as ScoutingTripStatus,
        createdAt: row.created_at,
        submittedAt: row.submitted_at,
        reviewedAt: row.final_reviewed_at,

        // Author info (stored directly in pitches table)
        authorName: row.author_name || 'Unknown',
        authorEmail: undefined, // Not stored in pitches table
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
    } catch (err: unknown) {
      console.error('[useAdminSubmissions] Error fetching submissions:', err);

      // Provide more specific error messages
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('JWT') || errorMessage.includes('auth')) {
        setError('Authentication error - please try signing in again');
      } else if (errorMessage.includes('permission') || errorMessage.includes('RLS')) {
        setError('Permission denied - admin access required');
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

  // Fetch when auth is ready (only once)
  useEffect(() => {
    if (authReady && !fetchAttempted.current) {
      fetchAttempted.current = true;
      fetchSubmissions();
    }
  }, [authReady, fetchSubmissions]);

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
