/**
 * User Content Check Utilities
 *
 * Before deleting a property, we need to check if it has user content.
 * If yes → soft delete (keep the record, mark as "removed")
 * If no → hard delete (safe to remove completely)
 *
 * User content includes:
 * - Comments on the property
 * - User-uploaded images/attachments
 * - Being in a user's list
 * - Being in a scouting trip/report
 */

import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Check if a place has any comments
 */
export async function hasComments(
  client: SupabaseClient,
  placeId: string
): Promise<boolean> {
  const { count, error } = await client
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "place")
    .eq("entity_id", placeId);

  if (error) {
    // If table doesn't exist yet, assume no comments
    if (error.code === "42P01") return false;
    throw error;
  }

  return (count || 0) > 0;
}

/**
 * Check if a place has any user-uploaded attachments
 */
export async function hasAttachments(
  client: SupabaseClient,
  placeId: string
): Promise<boolean> {
  const { count, error } = await client
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId);

  if (error) {
    // If table doesn't exist yet, assume no attachments
    if (error.code === "42P01") return false;
    throw error;
  }

  return (count || 0) > 0;
}

/**
 * Check if a place is in any user's list
 */
export async function isInAnyList(
  client: SupabaseClient,
  placeId: string
): Promise<boolean> {
  const { count, error } = await client
    .from("list_items")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId);

  if (error) {
    // If table doesn't exist yet, assume not in any list
    if (error.code === "42P01") return false;
    throw error;
  }

  return (count || 0) > 0;
}

/**
 * Check if a place is in any scouting trip/report
 */
export async function isInAnyScoutingTrip(
  client: SupabaseClient,
  placeId: string
): Promise<boolean> {
  const { count, error } = await client
    .from("scouting_reports")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId);

  if (error) {
    // If table doesn't exist yet, assume not in any trip
    if (error.code === "42P01") return false;
    throw error;
  }

  return (count || 0) > 0;
}

/**
 * Result of user content check
 */
export interface UserContentCheckResult {
  hasUserContent: boolean;
  details: {
    hasComments: boolean;
    hasAttachments: boolean;
    isInList: boolean;
    isInScoutingTrip: boolean;
  };
}

/**
 * Check if a place has ANY user content
 * If true, we should soft delete instead of hard delete
 */
export async function hasUserContent(
  client: SupabaseClient,
  placeId: string
): Promise<UserContentCheckResult> {
  // Run all checks in parallel for speed
  const [comments, attachments, inList, inTrip] = await Promise.all([
    hasComments(client, placeId),
    hasAttachments(client, placeId),
    isInAnyList(client, placeId),
    isInAnyScoutingTrip(client, placeId),
  ]);

  return {
    hasUserContent: comments || attachments || inList || inTrip,
    details: {
      hasComments: comments,
      hasAttachments: attachments,
      isInList: inList,
      isInScoutingTrip: inTrip,
    },
  };
}

/**
 * Get a summary string of user content (for logging)
 */
export function getUserContentSummary(result: UserContentCheckResult): string {
  if (!result.hasUserContent) {
    return "No user content";
  }

  const parts: string[] = [];
  if (result.details.hasComments) parts.push("comments");
  if (result.details.hasAttachments) parts.push("attachments");
  if (result.details.isInList) parts.push("in a list");
  if (result.details.isInScoutingTrip) parts.push("in scouting trip");

  return `Has: ${parts.join(", ")}`;
}
