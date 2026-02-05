/**
 * Supabase Client for Data Pipeline
 *
 * Provides two clients: dev and prod
 * - Use dev for testing new data before publishing
 * - Use prod only after confirming data looks good in dev
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Environment variable names
const DEV_URL = process.env.SUPABASE_DEV_URL;
const DEV_KEY = process.env.SUPABASE_DEV_KEY;
const PROD_URL = process.env.SUPABASE_PROD_URL;
const PROD_KEY = process.env.SUPABASE_PROD_KEY;

// Cached clients (created once, reused)
let devClient: SupabaseClient | null = null;
let prodClient: SupabaseClient | null = null;

/**
 * Get the DEV Supabase client
 * Use this for testing before publishing to prod
 */
export function getDevClient(): SupabaseClient {
  if (!DEV_URL || !DEV_KEY) {
    throw new Error(
      "Missing SUPABASE_DEV_URL or SUPABASE_DEV_KEY in environment variables.\n" +
        "Add these to your .env.local file."
    );
  }

  if (!devClient) {
    devClient = createClient(DEV_URL, DEV_KEY);
  }

  return devClient;
}

/**
 * Get the PROD Supabase client
 * Only use after confirming data is correct in dev
 */
export function getProdClient(): SupabaseClient {
  if (!PROD_URL || !PROD_KEY) {
    throw new Error(
      "Missing SUPABASE_PROD_URL or SUPABASE_PROD_KEY in environment variables.\n" +
        "Add these to your .env.local file."
    );
  }

  if (!prodClient) {
    prodClient = createClient(PROD_URL, PROD_KEY);
  }

  return prodClient;
}

/**
 * Get client by environment name
 */
export function getClient(env: "dev" | "prod"): SupabaseClient {
  return env === "dev" ? getDevClient() : getProdClient();
}

/**
 * Check if environment variables are configured
 */
export function checkConfig(): { dev: boolean; prod: boolean } {
  return {
    dev: Boolean(DEV_URL && DEV_KEY),
    prod: Boolean(PROD_URL && PROD_KEY),
  };
}

/**
 * Place interface matching database schema
 */
export interface Place {
  id?: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  category_id: string;
  source: string;
  source_id: string;
  metadata?: Record<string, unknown>;
  status?: "active" | "removed";
  removed_at?: string;
  removed_reason?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Check if a place exists by source and source_id
 */
export async function placeExists(
  client: SupabaseClient,
  source: string,
  sourceId: string
): Promise<boolean> {
  const { data, error } = await client
    .from("places")
    .select("id")
    .eq("source", source)
    .eq("source_id", sourceId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = not found, which is ok
    throw error;
  }

  return Boolean(data);
}

/**
 * Get a place by source and source_id
 */
export async function getPlace(
  client: SupabaseClient,
  source: string,
  sourceId: string
): Promise<Place | null> {
  const { data, error } = await client
    .from("places")
    .select("*")
    .eq("source", source)
    .eq("source_id", sourceId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data;
}

/**
 * Get all places by source
 */
export async function getPlacesBySource(
  client: SupabaseClient,
  source: string
): Promise<Place[]> {
  const { data, error } = await client
    .from("places")
    .select("*")
    .eq("source", source);

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Insert a new place
 */
export async function insertPlace(
  client: SupabaseClient,
  place: Place
): Promise<Place> {
  const { data, error } = await client
    .from("places")
    .insert(place)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Upsert a place (insert or update)
 * Uses source + source_id as the unique key
 */
export async function upsertPlace(
  client: SupabaseClient,
  place: Place
): Promise<Place> {
  const { data, error } = await client
    .from("places")
    .upsert(place, {
      onConflict: "source,source_id",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update specific fields of a place
 */
export async function updatePlace(
  client: SupabaseClient,
  source: string,
  sourceId: string,
  updates: Partial<Place>
): Promise<Place | null> {
  const { data, error } = await client
    .from("places")
    .update(updates)
    .eq("source", source)
    .eq("source_id", sourceId)
    .select()
    .single();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data;
}

/**
 * Soft delete a place (mark as removed)
 */
export async function softDeletePlace(
  client: SupabaseClient,
  source: string,
  sourceId: string,
  reason: string
): Promise<void> {
  const { error } = await client
    .from("places")
    .update({
      status: "removed",
      removed_at: new Date().toISOString(),
      removed_reason: reason,
    })
    .eq("source", source)
    .eq("source_id", sourceId);

  if (error) {
    throw error;
  }
}

/**
 * Hard delete a place
 */
export async function hardDeletePlace(
  client: SupabaseClient,
  source: string,
  sourceId: string
): Promise<void> {
  const { error } = await client
    .from("places")
    .delete()
    .eq("source", source)
    .eq("source_id", sourceId);

  if (error) {
    throw error;
  }
}

/**
 * Get all source_ids for a given source
 * Useful for checking what's already in the database
 */
export async function getExistingSourceIds(
  client: SupabaseClient,
  source: string
): Promise<Set<string>> {
  const { data, error } = await client
    .from("places")
    .select("source_id")
    .eq("source", source);

  if (error) {
    throw error;
  }

  return new Set((data || []).map((row) => row.source_id));
}
