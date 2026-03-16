"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { withSupabase } from '@/lib/supabaseHelpers';

// localStorage key for tracking when user last read activities
const LAST_READ_STORAGE_KEY = 'miners-activity-last-read';

/**
 * Activity types matching the existing ActivityLog component
 */
export type ActivityType = "added" | "updated" | "commented" | "visited" | "rated" | "created";

/**
 * Activity item for display in the activity feed
 */
export interface ActivityItem {
  id: string;
  type: ActivityType;
  userName: string;
  action: string;
  target: {
    name: string;
    type: "cafe" | "property" | "area" | "poi" | "list";
  };
  time: string;
  createdAt: string; // ISO timestamp for sorting
  isRead: boolean; // Whether user has seen this activity
}

/**
 * Get last read timestamp from localStorage
 */
function getLastReadTimestamp(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_READ_STORAGE_KEY);
}

/**
 * Save last read timestamp to localStorage
 */
function saveLastReadTimestamp(timestamp: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_READ_STORAGE_KEY, timestamp);
}

/**
 * Format a date into relative time (e.g., "2m ago", "1h ago", "3d ago")
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Get display name from user profile
 * Falls back to email prefix, then "Guest"
 */
function getDisplayName(profile: { display_name?: string | null; email?: string | null } | null): string {
  if (profile?.display_name) return profile.display_name;
  if (profile?.email) {
    const prefix = profile.email.split('@')[0];
    // Capitalize first letter
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  return 'Guest';
}

/**
 * Fetch recent comments from Supabase
 */
async function fetchRecentComments(): Promise<Array<{
  id: string;
  entity_id: string;
  entity_name: string | null;
  content: string;
  created_by: string | null;
  created_at: string;
}>> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const { data, error } = await supabase
    .from('comments')
    .select('id, entity_id, entity_name, content, created_by, created_at')
    .eq('entity_type', 'place')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching comments:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch recent lists from Supabase
 */
async function fetchRecentLists(): Promise<Array<{
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}>> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const { data, error } = await supabase
    .from('lists')
    .select('id, name, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching lists:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch user profiles by IDs
 */
async function fetchUserProfiles(userIds: string[]): Promise<Map<string, { display_name: string | null; email: string | null }>> {
  if (!isSupabaseConfigured() || !supabase || userIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, display_name, email')
    .in('id', userIds);

  if (error) {
    console.error('Error fetching user profiles:', error);
    return new Map();
  }

  const profileMap = new Map<string, { display_name: string | null; email: string | null }>();
  data?.forEach(profile => {
    profileMap.set(profile.id, { display_name: profile.display_name, email: profile.email });
  });

  return profileMap;
}

/**
 * Hook for fetching and displaying recent activities
 *
 * Queries comments and lists tables, fetches user profiles,
 * and merges into a sorted activity feed.
 * Tracks read/unread state via localStorage timestamp.
 */
export function useActivities() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  // Load lastReadAt from localStorage on mount
  useEffect(() => {
    setLastReadAt(getLastReadTimestamp());
  }, []);

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch comments and lists in parallel
      const [comments, lists] = await Promise.all([
        withSupabase(() => fetchRecentComments(), [], 'fetch comments'),
        withSupabase(() => fetchRecentLists(), [], 'fetch lists'),
      ]);

      // Collect unique user IDs
      const userIds = new Set<string>();
      comments.forEach(c => c.created_by && userIds.add(c.created_by));
      lists.forEach(l => l.created_by && userIds.add(l.created_by));

      // Batch fetch user profiles
      const profiles = await withSupabase(
        () => fetchUserProfiles(Array.from(userIds)),
        new Map(),
        'fetch profiles'
      );

      // Get current lastReadAt for determining read status
      const currentLastRead = getLastReadTimestamp();
      const lastReadTime = currentLastRead ? new Date(currentLastRead).getTime() : 0;

      // Map comments to activities
      const commentActivities: ActivityItem[] = comments.map(comment => ({
        id: `comment-${comment.id}`,
        type: 'commented' as ActivityType,
        userName: getDisplayName(profiles.get(comment.created_by || '') || null),
        action: 'commented on',
        target: {
          name: comment.entity_name || 'a place',
          type: 'cafe' as const,
        },
        time: formatRelativeTime(comment.created_at),
        createdAt: comment.created_at,
        isRead: new Date(comment.created_at).getTime() <= lastReadTime,
      }));

      // Map lists to activities
      const listActivities: ActivityItem[] = lists.map(list => ({
        id: `list-${list.id}`,
        type: 'created' as ActivityType,
        userName: getDisplayName(profiles.get(list.created_by || '') || null),
        action: 'created list',
        target: {
          name: `"${list.name}"`,
          type: 'list' as const,
        },
        time: formatRelativeTime(list.created_at),
        createdAt: list.created_at,
        isRead: new Date(list.created_at).getTime() <= lastReadTime,
      }));

      // Merge and sort by created_at (newest first)
      const allActivities = [...commentActivities, ...listActivities]
        .sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 50);

      setActivities(allActivities);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError('Failed to load activities');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Mark all activities as read
  const markAllAsRead = useCallback(() => {
    const now = new Date().toISOString();
    saveLastReadTimestamp(now);
    setLastReadAt(now);
    // Update all activities to be read
    setActivities(prev => prev.map(a => ({ ...a, isRead: true })));
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Calculate unread count
  const unreadCount = activities.filter(a => !a.isRead).length;

  return {
    activities,
    isLoading,
    error,
    refetch: fetchActivities,
    unreadCount,
    markAllAsRead,
  };
}
