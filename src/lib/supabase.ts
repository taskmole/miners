/**
 * Supabase Browser Client
 *
 * Browser-side Supabase client for the Next.js app.
 * Currently uses anonymous access (public anon key).
 *
 * Migration notes:
 * - When auth is added, this client will automatically handle sessions
 * - The anon key is safe to expose client-side (RLS policies protect data)
 * - For server-side operations, use the data-pipeline client instead
 *
 * Usage:
 *   import { supabase, isSupabaseConfigured } from '@/lib/supabase';
 *
 *   if (isSupabaseConfigured()) {
 *     const { data } = await supabase.from('places').select('*');
 *   }
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { setAuthUserId } from './browser-session';

// Environment variables (set in .env.local)
// These are the PUBLIC keys - safe to expose in browser
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Cached client instance
let client: SupabaseClient | null = null;

/**
 * Check if Supabase is configured
 * Use this to gracefully fall back to localStorage when Supabase isn't set up
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Get the Supabase client
 * Throws if not configured - check isSupabaseConfigured() first
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local'
    );
  }

  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        // Persist sessions in localStorage
        persistSession: true,
        // Auto-refresh tokens
        autoRefreshToken: true,
        // Detect session from URL (for OAuth callbacks)
        detectSessionInUrl: true,
      },
    });
  }

  return client;
}

/**
 * Convenience export - the client instance
 * Will be null if Supabase isn't configured
 */
export const supabase = isSupabaseConfigured() ? getSupabase() : null;

// ===========================================
// AUTH HELPERS (ready for when auth is added)
// ===========================================

/**
 * Get the current authenticated user
 * Returns null if not logged in or Supabase isn't configured
 */
export async function getCurrentUser() {
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Get the current user's ID
 * Returns null if not logged in
 */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(): Promise<boolean> {
  const user = await getCurrentUser();
  return user !== null;
}

/**
 * Remove Supabase's stored auth session from localStorage
 *
 * Fallback for a failed server sign-out. Supabase persists the session under
 * `sb-<project-ref>-auth-token`, and when its own sign-out bails early that
 * entry survives, which would restore the session on the next page load.
 */
function clearStoredSupabaseSession(): void {
  if (typeof window === 'undefined') return;

  // Object.keys() snapshots the keys, so removing while looping is safe.
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith('sb-') && key.includes('-auth-token')) {
      window.localStorage.removeItem(key);
    }
  }
}

/**
 * Sign out the current user
 *
 * Clears the Supabase session, drops the cached auth user id, then hard-reloads
 * the app. The reload matters: the page keeps user-scoped state (landing page
 * hidden, selected city, active-account flag) that is only set on sign-in and
 * never reset, so without it the UI still looks signed in.
 */
export async function signOut(): Promise<void> {
  if (supabase) {
    // signOut() reports failure by returning an error rather than throwing, and
    // on anything other than a 401/403/404 it returns before clearing local
    // storage. Left alone that stale session comes straight back on reload, so
    // clear it ourselves whenever the call did not succeed.
    let failed = false;
    try {
      const { error } = await supabase.auth.signOut();
      failed = Boolean(error);
    } catch {
      failed = true;
    }

    if (failed) clearStoredSupabaseSession();
  }

  if (typeof window !== 'undefined') {
    setAuthUserId(null);
    window.location.href = '/';
  }
}

// ===========================================
// TYPE DEFINITIONS (match database schema)
// ===========================================

/**
 * Database types - manually defined to match create-tables.sql
 *
 * Every table from the schema is represented here with Row, Insert, and Update types.
 * Row = what you get back from a SELECT
 * Insert = what you pass to an INSERT (auto-generated fields omitted)
 * Update = partial version of Insert (for PATCH-style updates)
 *
 * Geography columns use `unknown` since PostGIS types are returned as GeoJSON strings.
 * JSON/JSONB columns use `Record<string, unknown>` or more specific types where known.
 */
export interface Database {
  public: {
    Tables: {

      // ===========================================
      // FOUNDATION TABLES
      // ===========================================

      cities: {
        Row: {
          id: string;
          name: string;
          country: string | null;
          center: unknown | null;       // geography(POINT)
          bounds: unknown | null;       // geography(POLYGON)
          config: Record<string, unknown> | null;
          enabled: boolean;
        };
        Insert: {
          id: string;
          name: string;
          country?: string | null;
          center?: unknown | null;
          bounds?: unknown | null;
          config?: Record<string, unknown> | null;
          enabled?: boolean;
        };
        Update: Partial<Database['public']['Tables']['cities']['Insert']>;
      };

      app_settings: {
        Row: {
          key: string;
          value: Record<string, unknown> | null;  // jsonb
          updated_at: string;
        };
        Insert: {
          key: string;
          value?: Record<string, unknown> | null;
        };
        Update: Partial<Database['public']['Tables']['app_settings']['Insert']>;
      };

      categories: {
        Row: {
          id: string;
          name: string;
          icon: string | null;
          color: string | null;
          is_system: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          name: string;
          icon?: string | null;
          color?: string | null;
          is_system?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
      };

      scoring_params: {
        Row: {
          id: string;
          name: string;
          weight: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          name: string;
          weight?: number;
          updated_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['scoring_params']['Insert']>;
      };

      regions: {
        Row: {
          id: string;
          name: string;
          city_id: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          city_id?: string | null;
          description?: string | null;
        };
        Update: Partial<Database['public']['Tables']['regions']['Insert']>;
      };

      comments: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          created_by: string | null;
          content: string;
          created_at: string;
        };
        Insert: {
          entity_type: string;
          entity_id: string;
          created_by?: string | null;
          content: string;
        };
        Update: Partial<Database['public']['Tables']['comments']['Insert']>;
      };

      tags: {
        Row: {
          id: string;
          entity_type: string;
          entity_id: string;
          tag: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          entity_type: string;
          entity_id: string;
          tag: string;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tags']['Insert']>;
      };

      // ===========================================
      // USER MANAGEMENT
      // ===========================================

      teams: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          name: string;
        };
        Update: {
          name?: string;
        };
      };

      user_profiles: {
        Row: {
          id: string;
          role: string;
          display_name: string | null;
          email: string | null;
          region_id: string | null;
          city_ids: string[] | null;
          can_approve_level: number | null;
          is_active: boolean;
          team_id: string | null;
          receives_scraper_emails: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: string;
          display_name?: string | null;
          email?: string | null;
          region_id?: string | null;
          city_ids?: string[] | null;
          can_approve_level?: number | null;
          is_active?: boolean;
          team_id?: string | null;
          receives_scraper_emails?: boolean;
        };
        Update: Partial<Database['public']['Tables']['user_profiles']['Insert']>;
      };

      user_activity_state: {
        Row: {
          user_id: string;
          last_viewed_at: string;
        };
        Insert: {
          user_id: string;
          last_viewed_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_activity_state']['Insert']>;
      };

      hidden_pois: {
        Row: {
          id: string;
          user_id: string;
          place_id: string;
          hidden_at: string;
        };
        Insert: {
          user_id: string;
          place_id: string;
        };
        Update: Partial<Database['public']['Tables']['hidden_pois']['Insert']>;
      };

      mentions: {
        Row: {
          id: string;
          comment_id: string;
          mentioned_user_id: string;
          mentioned_by_user_id: string;
          entity_type: string;
          entity_id: string;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          comment_id: string;
          mentioned_user_id: string;
          mentioned_by_user_id: string;
          entity_type: string;
          entity_id: string;
          is_read?: boolean;
          read_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['mentions']['Insert']>;
      };

      // ===========================================
      // MAIN DATA TABLES
      // ===========================================

      places: {
        Row: {
          id: string;
          city_id: string | null;
          category_id: string | null;
          source: string;
          source_id: string | null;
          name: string;
          address: string | null;
          location: unknown;            // geography(POINT)
          metadata: Record<string, unknown> | null;
          photos: string[] | null;
          is_new: boolean;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          last_seen_at: string;
        };
        Insert: {
          city_id?: string | null;
          category_id?: string | null;
          source: string;
          source_id?: string | null;
          name: string;
          address?: string | null;
          location: unknown;
          metadata?: Record<string, unknown> | null;
          photos?: string[] | null;
          is_new?: boolean;
          status?: string;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['places']['Insert']>;
      };

      cafe_profiles: {
        Row: {
          id: string;
          place_id: string;
          category: string;
          interior_seats: number;
          exterior_seats: number;
          area_sqm: number | null;
          monthly_revenue: number | null;
          has_kitchen: boolean;
          notes: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          place_id: string;
          category: string;
          interior_seats?: number;
          exterior_seats?: number;
          area_sqm?: number | null;
          monthly_revenue?: number | null;
          has_kitchen?: boolean;
          notes?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['cafe_profiles']['Insert']>;
      };

      areas: {
        Row: {
          id: string;
          city_id: string | null;
          name: string;
          link: string | null;
          geometry: unknown;            // geography(POLYGON)
          tags: string[] | null;
          color: string | null;
          comments: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          city_id?: string | null;
          name: string;
          link?: string | null;
          geometry: unknown;
          tags?: string[] | null;
          color?: string | null;
          comments?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['areas']['Insert']>;
      };

      polygon_layers: {
        Row: {
          id: string;
          city_id: string | null;
          layer_type: string;
          name: string;
          geometry: unknown;            // geography(POLYGON)
          metadata: Record<string, unknown> | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          city_id?: string | null;
          layer_type: string;
          name: string;
          geometry: unknown;
          metadata?: Record<string, unknown> | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['polygon_layers']['Insert']>;
      };

      traffic_data: {
        Row: {
          id: string;
          city_id: string | null;
          location: unknown | null;     // geography(POINT)
          distrito: string | null;
          direccion: string | null;
          hora: number | null;
          avg_count: number | null;
          source: string | null;
          period: string | null;        // date
          created_at: string;
        };
        Insert: {
          city_id?: string | null;
          location?: unknown | null;
          distrito?: string | null;
          direccion?: string | null;
          hora?: number | null;
          avg_count?: number | null;
          source?: string | null;
          period?: string | null;
        };
        Update: Partial<Database['public']['Tables']['traffic_data']['Insert']>;
      };

      footfall_data: {
        Row: {
          id: string;
          city_id: string;
          district: string | null;
          address: string | null;
          location: unknown;            // geography(POINT)
          hour_0: number | null;
          hour_1: number | null;
          hour_2: number | null;
          hour_3: number | null;
          hour_4: number | null;
          hour_5: number | null;
          hour_6: number | null;
          hour_7: number | null;
          hour_8: number | null;
          hour_9: number | null;
          hour_10: number | null;
          hour_11: number | null;
          hour_12: number | null;
          hour_13: number | null;
          hour_14: number | null;
          hour_15: number | null;
          hour_16: number | null;
          hour_17: number | null;
          hour_18: number | null;
          hour_19: number | null;
          hour_20: number | null;
          hour_21: number | null;
          hour_22: number | null;
          hour_23: number | null;
          data_collection_date: string | null;  // date
          data_source: string | null;
          created_at: string;
        };
        Insert: {
          city_id: string;
          district?: string | null;
          address?: string | null;
          location: unknown;
          hour_0?: number | null;
          hour_1?: number | null;
          hour_2?: number | null;
          hour_3?: number | null;
          hour_4?: number | null;
          hour_5?: number | null;
          hour_6?: number | null;
          hour_7?: number | null;
          hour_8?: number | null;
          hour_9?: number | null;
          hour_10?: number | null;
          hour_11?: number | null;
          hour_12?: number | null;
          hour_13?: number | null;
          hour_14?: number | null;
          hour_15?: number | null;
          hour_16?: number | null;
          hour_17?: number | null;
          hour_18?: number | null;
          hour_19?: number | null;
          hour_20?: number | null;
          hour_21?: number | null;
          hour_22?: number | null;
          hour_23?: number | null;
          data_collection_date?: string | null;
          data_source?: string | null;
        };
        Update: Partial<Database['public']['Tables']['footfall_data']['Insert']>;
      };

      // ===========================================
      // USER CONTENT TABLES
      // ===========================================

      lists: {
        Row: {
          id: string;
          name: string;
          created_by: string | null;
          created_at: string;
          team_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          created_by?: string | null;
          created_at?: string;
          team_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['lists']['Insert']>;
      };

      list_items: {
        Row: {
          id: string;
          list_id: string | null;
          place_id: string | null;
          visit_date: string | null;    // date
          visit_time: string | null;    // time
          weather: string | null;
          traffic_observation: string | null;
          comments: string | null;
          added_at: string;
        };
        Insert: {
          list_id?: string | null;
          place_id?: string | null;
          visit_date?: string | null;
          visit_time?: string | null;
          weather?: string | null;
          traffic_observation?: string | null;
          comments?: string | null;
        };
        Update: Partial<Database['public']['Tables']['list_items']['Insert']>;
      };

      scouting_reports: {
        Row: {
          id: string;
          place_id: string | null;
          created_by: string | null;
          notes: string | null;
          photos: string[] | null;
          created_at: string;
        };
        Insert: {
          place_id?: string | null;
          created_by?: string | null;
          notes?: string | null;
          photos?: string[] | null;
        };
        Update: Partial<Database['public']['Tables']['scouting_reports']['Insert']>;
      };

      activity_log: {
        Row: {
          id: string;
          user_id: string | null;
          city_id: string | null;
          action_type: string;
          entity_type: string | null;
          entity_id: string | null;
          summary: string | null;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          city_id?: string | null;
          action_type: string;
          entity_type?: string | null;
          entity_id?: string | null;
          summary?: string | null;
        };
        Update: Partial<Database['public']['Tables']['activity_log']['Insert']>;
      };

      // ===========================================
      // APPROVAL WORKFLOW TABLES
      // ===========================================

      approval_workflows: {
        Row: {
          id: string;
          name: string;
          city_id: string | null;
          num_levels: number;
          level_1_role: string;
          level_2_role: string;
          level_3_role: string;
          level_4_role: string | null;
          is_default: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          city_id?: string | null;
          num_levels?: number;
          level_1_role?: string;
          level_2_role?: string;
          level_3_role?: string;
          level_4_role?: string | null;
          is_default?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['approval_workflows']['Insert']>;
      };

      pitches: {
        Row: {
          id: string;
          city_id: string | null;
          place_id: string | null;
          created_by: string | null;
          workflow_id: string | null;
          status: string;
          current_level: number;
          condition_notes: string | null;
          rejection_level: number | null;
          revision_count: number;
          address: string | null;
          area_sqm: number | null;
          storage_sqm: number | null;
          property_type: string | null;
          footfall_estimate: number | null;
          neighbourhood_profile: string | null;
          nearby_competitors: string | null;
          monthly_rent: number | null;
          service_fees: number | null;
          deposit: number | null;
          fitout_cost: number | null;
          opening_investment: number | null;
          expected_daily_revenue: number | null;
          monthly_revenue_range: string | null;
          payback_months: number | null;
          currency_code: string | null;
          ventilation: string | null;
          water_waste: string | null;
          power_capacity: string | null;
          visibility: string | null;
          delivery_access: string | null;
          seating_capacity: number | null;
          outdoor_seating: string | null;
          flat_surface: boolean | null;
          risks: string[] | null;
          photos: string[] | null;
          submitted_at: string | null;
          final_reviewed_at: string | null;
          final_reviewed_by: string | null;
          team_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          city_id?: string | null;
          place_id?: string | null;
          created_by?: string | null;
          team_id?: string | null;
          workflow_id?: string | null;
          status?: string;
          current_level?: number;
          condition_notes?: string | null;
          rejection_level?: number | null;
          revision_count?: number;
          address?: string | null;
          area_sqm?: number | null;
          storage_sqm?: number | null;
          property_type?: string | null;
          footfall_estimate?: number | null;
          neighbourhood_profile?: string | null;
          nearby_competitors?: string | null;
          monthly_rent?: number | null;
          service_fees?: number | null;
          deposit?: number | null;
          fitout_cost?: number | null;
          opening_investment?: number | null;
          expected_daily_revenue?: number | null;
          monthly_revenue_range?: string | null;
          payback_months?: number | null;
          currency_code?: string | null;
          ventilation?: string | null;
          water_waste?: string | null;
          power_capacity?: string | null;
          visibility?: string | null;
          delivery_access?: string | null;
          seating_capacity?: number | null;
          outdoor_seating?: string | null;
          flat_surface?: boolean | null;
          risks?: string[] | null;
          photos?: string[] | null;
          submitted_at?: string | null;
          final_reviewed_at?: string | null;
          final_reviewed_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['pitches']['Insert']>;
      };

      pitch_approvals: {
        Row: {
          id: string;
          pitch_id: string | null;
          level_number: number;
          approver_id: string | null;
          decision: string;
          comments: string | null;
          created_at: string;
        };
        Insert: {
          pitch_id?: string | null;
          level_number: number;
          approver_id?: string | null;
          decision: string;
          comments?: string | null;
        };
        Update: Partial<Database['public']['Tables']['pitch_approvals']['Insert']>;
      };

      // ===========================================
      // PERFORMANCE & REVENUE TABLES
      // ===========================================

      cafe_performance: {
        Row: {
          id: string;
          place_id: string;
          month: string;                // date
          monthly_revenue: number | null;
          monthly_costs: number | null;
          monthly_profit: number | null;
          avg_daily_customers: number | null;
          notes: string | null;
          recorded_by: string | null;
          created_at: string;
        };
        Insert: {
          place_id: string;
          month: string;
          monthly_revenue?: number | null;
          monthly_costs?: number | null;
          monthly_profit?: number | null;
          avg_daily_customers?: number | null;
          notes?: string | null;
          recorded_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['cafe_performance']['Insert']>;
      };

      revenue_data: {
        Row: {
          id: string;
          place_id: string | null;
          date: string;                 // date
          source: string;
          daily_revenue: number | null;
          transaction_count: number | null;
          avg_ticket_size: number | null;
          rent_cost: number | null;
          labor_cost: number | null;
          supplies_cost: number | null;
          other_costs: number | null;
          total_costs: number | null;
          gross_profit: number | null;
          net_profit: number | null;
          margin_percent: number | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          place_id?: string | null;
          date: string;
          source?: string;
          daily_revenue?: number | null;
          transaction_count?: number | null;
          avg_ticket_size?: number | null;
          rent_cost?: number | null;
          labor_cost?: number | null;
          supplies_cost?: number | null;
          other_costs?: number | null;
          total_costs?: number | null;
          gross_profit?: number | null;
          net_profit?: number | null;
          margin_percent?: number | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['revenue_data']['Insert']>;
      };

      performance_data: {
        Row: {
          id: string;
          place_id: string | null;
          date: string | null;          // date
          traffic_per_hour: number | null;
          conversion_rate: number | null;
          avg_spend: number | null;
          revenue: number | null;
          custom_metrics: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          place_id?: string | null;
          date?: string | null;
          traffic_per_hour?: number | null;
          conversion_rate?: number | null;
          avg_spend?: number | null;
          revenue?: number | null;
          custom_metrics?: Record<string, unknown> | null;
        };
        Update: Partial<Database['public']['Tables']['performance_data']['Insert']>;
      };

      performance_targets: {
        Row: {
          id: string;
          place_id: string | null;
          target_type: string;
          target_value: number;
          alert_threshold_percent: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          place_id?: string | null;
          target_type: string;
          target_value: number;
          alert_threshold_percent?: number;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['performance_targets']['Insert']>;
      };

      competitor_metrics: {
        Row: {
          id: string;
          place_id: string | null;
          estimated_daily_revenue: number | null;
          estimated_monthly_revenue: number | null;
          revenue_confidence: string | null;
          price_level: string | null;
          market_share_percent: number | null;
          specialties: string[] | null;
          chain_affiliation: string | null;
          is_specialty_coffee: boolean;
          seating_capacity_estimate: number | null;
          has_outdoor_seating: boolean | null;
          opened_date: string | null;   // date
          closed_date: string | null;   // date
          last_rating: number | null;
          last_review_count: number | null;
          rating_trend: string | null;
          notes: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          place_id?: string | null;
          estimated_daily_revenue?: number | null;
          estimated_monthly_revenue?: number | null;
          revenue_confidence?: string | null;
          price_level?: string | null;
          market_share_percent?: number | null;
          specialties?: string[] | null;
          chain_affiliation?: string | null;
          is_specialty_coffee?: boolean;
          seating_capacity_estimate?: number | null;
          has_outdoor_seating?: boolean | null;
          opened_date?: string | null;
          closed_date?: string | null;
          last_rating?: number | null;
          last_review_count?: number | null;
          rating_trend?: string | null;
          notes?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['competitor_metrics']['Insert']>;
      };

      // ===========================================
      // GRAVITY MODEL & LOCATION SCORING
      // ===========================================

      gravity_scores: {
        Row: {
          id: string;
          city_id: string;
          location: unknown;            // geography(POINT)
          score: number;
          normalized_score: number;
          resolution_meters: number;
          params_version: string;
          calculated_at: string;
        };
        Insert: {
          city_id: string;
          location: unknown;
          score: number;
          normalized_score: number;
          resolution_meters: number;
          params_version: string;
        };
        Update: Partial<Database['public']['Tables']['gravity_scores']['Insert']>;
      };

      gravity_batches: {
        Row: {
          id: string;
          city_id: string;
          params_version: string;
          weights: Record<string, unknown>;  // jsonb
          beta: number;
          resolution_meters: number;
          point_count: number;
          min_score: number | null;
          max_score: number | null;
          calculated_by: string | null;
          calculated_at: string;
        };
        Insert: {
          city_id: string;
          params_version: string;
          weights: Record<string, unknown>;
          beta: number;
          resolution_meters: number;
          point_count: number;
          min_score?: number | null;
          max_score?: number | null;
          calculated_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['gravity_batches']['Insert']>;
      };

      // ===========================================
      // PROFITABILITY PREDICTION TABLES
      // ===========================================

      profitability_benchmarks: {
        Row: {
          id: string;
          city: string;
          avg_ticket_price: number;
          conversion_rate: number;
          operating_hours_per_day: number;
          fixed_monthly_costs: number;
          variable_cost_per_customer: number;
          typical_setup_cost: number;
          near_transit_bonus: number;
          near_university_bonus: number;
          near_office_bonus: number;
          high_competition_penalty: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          city: string;
          avg_ticket_price: number;
          conversion_rate: number;
          operating_hours_per_day: number;
          fixed_monthly_costs: number;
          variable_cost_per_customer: number;
          typical_setup_cost: number;
          near_transit_bonus?: number;
          near_university_bonus?: number;
          near_office_bonus?: number;
          high_competition_penalty?: number;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['profitability_benchmarks']['Insert']>;
      };

      prospective_locations: {
        Row: {
          id: string;
          user_id: string;
          city_id: string;
          name: string;
          location: unknown;            // geography(POINT)
          address: string | null;
          monthly_rent: number | null;
          size_sqm: number | null;
          transfer_fee: number | null;
          linked_idealista_id: string | null;
          prediction_json: Record<string, unknown> | null;
          prediction_calculated_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          city_id: string;
          name: string;
          location: unknown;
          address?: string | null;
          monthly_rent?: number | null;
          size_sqm?: number | null;
          transfer_fee?: number | null;
          linked_idealista_id?: string | null;
          prediction_json?: Record<string, unknown> | null;
          prediction_calculated_at?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['prospective_locations']['Insert']>;
      };

      // ===========================================
      // ACTIVITY LOG READ TRACKING (migration 001)
      // ===========================================

      activity_log_reads: {
        Row: {
          id: string;
          user_id: string;
          activity_log_id: string;
          read_at: string;
        };
        Insert: {
          user_id: string;
          activity_log_id: string;
        };
        Update: Partial<Database['public']['Tables']['activity_log_reads']['Insert']>;
      };

      // ===========================================
      // DRAWN FEATURES (map shapes backup)
      // ===========================================

      drawn_features: {
        Row: {
          id: string;
          user_id: string | null;
          city_id: string | null;
          geojson: Record<string, unknown> | null;  // Full GeoJSON Feature object
          name: string | null;
          color: string | null;
          tags: string[] | null;
          link: string | null;
          category_id: string | null;
          address: string | null;
          address_coords: number[] | null;           // [lon, lat]
          created_by: string | null;
          attachments: Record<string, unknown>[] | null;  // Array of attachment objects
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;                                // MapboxDraw feature ID
          user_id?: string | null;
          city_id?: string | null;
          geojson?: Record<string, unknown> | null;
          name?: string | null;
          color?: string | null;
          tags?: string[] | null;
          link?: string | null;
          category_id?: string | null;
          address?: string | null;
          address_coords?: number[] | null;
          created_by?: string | null;
          attachments?: Record<string, unknown>[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['drawn_features']['Insert']>;
      };

      property_assignments: {
        Row: {
          id: string;
          property_place_id: string;
          assigned_to: string | null;
          assigned_to_team: string | null;
          assigned_by: string;
          status: string;
          rejection_reason: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          property_place_id: string;
          assigned_to?: string | null;
          assigned_to_team?: string | null;
          assigned_by: string;
          status?: string;
          rejection_reason?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database['public']['Tables']['property_assignments']['Insert']>;
      };

      property_requests: {
        Row: {
          id: string;
          property_place_id: string;
          requested_by: string;
          status: string;
          property_name: string | null;
          property_address: string | null;
          property_url: string | null;
          note: string | null;
          decided_by: string | null;
          decided_at: string | null;
          decision_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          property_place_id: string;
          requested_by: string;
          status?: string;
          property_name?: string | null;
          property_address?: string | null;
          property_url?: string | null;
          note?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_reason?: string | null;
        };
        Update: Partial<Database['public']['Tables']['property_requests']['Insert']>;
      };

      teams: {
        Row: {
          id: string;
          name: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          is_active: boolean;
        };
        Insert: {
          name: string;
          created_by: string;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['teams']['Insert']>;
      };

      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: string;
          added_by: string;
          added_at: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
          role?: string;
          added_by: string;
        };
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>;
      };

    };
  };
}
