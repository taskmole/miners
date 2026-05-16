"use client";

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';

const LAST_READ_STORAGE_KEY = 'miners-activity-last-read';

export type ActivityType = "added" | "updated" | "commented" | "visited" | "rated" | "created" | "deleted";

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
  entityId?: string; // placeId, listId, or shapeId for click-to-navigate
  lat?: number; // For map navigation
  lon?: number; // For map navigation
  isOrphaned?: boolean; // True when a created_point/created_area's target no longer exists
  actionType?: string; // Original action_type for orphan checking
}

function getLastReadTimestamp(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LAST_READ_STORAGE_KEY);
}

function saveLastReadTimestamp(timestamp: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_READ_STORAGE_KEY, timestamp);
}

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

function getDisplayName(profile: { display_name?: string | null; email?: string | null } | null): string {
  if (profile?.display_name) return profile.display_name;
  if (profile?.email) {
    const prefix = profile.email.split('@')[0];
    // Capitalize first letter
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }
  return 'Guest';
}

const PLACE_TYPE_LABELS: Record<string, string> = {
  cafe: 'cafe',
  eu_coffee_trip: 'coffee trip cafe',
  regular_cafe: 'cafe',
  property: 'property',
  transit: 'train station',
  metro: 'metro station',
  office: 'office',
  shopping: 'shopping center',
  high_street: 'high street shop',
  dorm: 'dormitory',
  university: 'university',
  gym: 'gym',
};

function friendlyPlaceType(type?: string): string {
  if (!type) return '';
  return PLACE_TYPE_LABELS[type] || type.replace(/_/g, ' ');
}

const ACTION_TYPE_MAP: Record<string, { type: ActivityType; action: string; targetType: ActivityItem['target']['type'] }> = {
  added_to_list: { type: 'added', action: 'added', targetType: 'list' },
  added_attachment: { type: 'added', action: 'added attachment to', targetType: 'poi' },
  created_point: { type: 'created', action: 'created point', targetType: 'poi' },
  created_area: { type: 'created', action: 'created area', targetType: 'area' },
  commented_on_shape: { type: 'commented', action: 'commented on', targetType: 'area' },
  removed_from_list: { type: 'deleted', action: 'removed', targetType: 'list' },
  deleted_list: { type: 'deleted', action: 'deleted list', targetType: 'list' },
  deleted_comment: { type: 'deleted', action: 'deleted comment on', targetType: 'poi' },
  deleted_attachment: { type: 'deleted', action: 'deleted attachment from', targetType: 'poi' },
  assigned_property: { type: 'added', action: 'assigned', targetType: 'property' },
  pre_rejected_property: { type: 'deleted', action: 'pre-rejected', targetType: 'property' },
  removed_assignment: { type: 'deleted', action: 'removed assignment from', targetType: 'property' },
  created_scouting_trip: { type: 'created', action: 'created scouting trip for', targetType: 'property' },
  submitted_scouting_trip: { type: 'added', action: 'submitted scouting trip for', targetType: 'property' },
  approved_scouting_trip: { type: 'updated', action: 'approved scouting trip for', targetType: 'property' },
  rejected_scouting_trip: { type: 'deleted', action: 'rejected scouting trip for', targetType: 'property' },
};

function parseSummary(summary: string | null): Record<string, unknown> {
  if (!summary) return {};
  try {
    return JSON.parse(summary);
  } catch {
    return {};
  }
}

function buildTargetName(
  actionType: string,
  nameWithType: string,
  summary: Record<string, unknown>,
): string {
  switch (actionType) {
    case 'added_to_list':
      return summary.listName ? `${nameWithType} to "${summary.listName}"` : nameWithType;

    case 'removed_from_list':
      return summary.listName ? `${nameWithType} from "${summary.listName}"` : nameWithType;

    case 'deleted_list':
      return `"${summary.listName || 'a list'}"`;

    case 'added_attachment':
    case 'deleted_attachment':
    case 'deleted_comment':
      return nameWithType;

    case 'assigned_property': {
      const name = (summary.placeName as string) || 'a property';
      const assignee = summary.assigneeName as string | null;
      return assignee ? `${name} to ${assignee}` : name;
    }

    case 'pre_rejected_property':
    case 'removed_assignment':
      return (summary.placeName as string) || 'a property';

    case 'created_scouting_trip':
    case 'submitted_scouting_trip':
    case 'approved_scouting_trip':
    case 'rejected_scouting_trip':
      return (summary.tripName as string) || (summary.placeName as string) || 'a trip';

    default:
      return (summary.placeName as string) || (summary.shapeName as string) || (summary.name as string) || 'a place';
  }
}

interface ActivitiesResponse {
  comments: Array<{
    id: string;
    entity_id: string;
    entity_name: string | null;
    content: string;
    created_by: string | null;
    created_at: string;
  }>;
  lists: Array<{
    id: string;
    name: string;
    created_by: string | null;
    created_at: string;
  }>;
  activityLog: Array<{
    id: string;
    user_id: string | null;
    action_type: string;
    summary: string | null;
    created_at: string;
  }>;
  userProfiles: Array<{
    id: string;
    display_name: string | null;
    email: string | null;
  }>;
}

export function useActivities() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  useEffect(() => {
    setLastReadAt(getLastReadTimestamp());
  }, []);

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetch<ActivitiesResponse>('/api/db/activities');

      const { comments, lists, activityLog, userProfiles } = data;

      const profiles = new Map<string, { display_name: string | null; email: string | null }>();
      userProfiles.forEach(profile => {
        profiles.set(profile.id, { display_name: profile.display_name, email: profile.email });
      });

      const currentLastRead = getLastReadTimestamp();
      const lastReadTime = currentLastRead ? new Date(currentLastRead).getTime() : 0;

      const commentActivities: ActivityItem[] = comments
        .filter(comment => comment.created_by && profiles.has(comment.created_by))
        .map(comment => ({
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
        entityId: comment.entity_id,
      }));

      const listActivities: ActivityItem[] = lists
        .filter(list => list.created_by && profiles.has(list.created_by))
        .map(list => ({
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
        entityId: list.id,
      }));

      const activityLogActivities: ActivityItem[] = activityLog
        .filter(entry => entry.user_id && profiles.has(entry.user_id))
        .map(entry => {
          const summary = parseSummary(entry.summary);
          const config = ACTION_TYPE_MAP[entry.action_type] || { type: 'added' as ActivityType, action: entry.action_type, targetType: 'poi' as const };
          const typeLabel = friendlyPlaceType(summary.placeType as string);
          const placeName = (summary.placeName as string) || 'a place';
          const nameWithType = typeLabel ? `${typeLabel} ${placeName}` : placeName;
          const targetName = buildTargetName(entry.action_type, nameWithType, summary);
          const lat = typeof summary.lat === 'number' && isFinite(summary.lat) ? summary.lat : undefined;
          const lon = typeof summary.lon === 'number' && isFinite(summary.lon) ? summary.lon : undefined;
          return {
            id: `log-${entry.id}`,
            type: config.type,
            userName: getDisplayName(profiles.get(entry.user_id || '') || null),
            action: config.action,
            target: {
              name: targetName,
              type: config.targetType,
            },
            time: formatRelativeTime(entry.created_at),
            createdAt: entry.created_at,
            isRead: new Date(entry.created_at).getTime() <= lastReadTime,
            entityId: (summary.placeId as string) || (summary.shapeId as string) || undefined,
            lat,
            lon,
            actionType: entry.action_type,
          };
        });

      // Merge, filter out empty entries, and sort by created_at (newest first)
      const allActivities = [...commentActivities, ...listActivities, ...activityLogActivities]
        .filter(a => a.userName && a.action && a.target.name)
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
