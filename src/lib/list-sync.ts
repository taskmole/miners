/**
 * Retry queue for list sync operations.
 * All server writes go through this queue to guarantee delivery.
 */

import { apiFetch } from '@/lib/api-client';
import { getAuthUserId } from '@/lib/browser-session';

// --- Types ---

type SyncAction =
  | { type: 'create_list'; listId: string; payload: { id: string; name: string; created_by: string; created_at: string } }
  | { type: 'rename_list'; listId: string; payload: { id: string; name: string; created_by: string } }
  | { type: 'add_item'; listId: string; payload: { id: string; list_id: string; place_id: string; place_type: string; place_name: string; place_address: string; lat: number; lon: number; added_at: string } }
  | { type: 'remove_item'; listId: string; payload: { itemId: string } }
  | { type: 'remove_item_by_place'; listId: string; payload: { listId: string; placeId: string } }
  | { type: 'delete_list'; listId: string; payload: { listId: string } };

interface QueueEntry {
  id: string;
  action: SyncAction;
  userId: string;
  createdAt: number;
  retryCount: number;
  nextRetryAt: number;
}

// --- Constants ---

const STORAGE_KEY = 'miners_sync_queue';
const MAX_BACKOFF_MS = 30_000;
const BASE_DELAY_MS = 2_000;

// --- State ---

let queue: QueueEntry[] = [];
let processing = false;
let drainTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Lists the caller may look at but not change: somebody else's, visible
 * because they approve in a city that person works in.
 *
 * The UI hides every control that would write to one, so nothing should ever
 * reach here. This is the backstop that makes that a guarantee rather than a
 * hope: a queued write survives a reload and a network outage, so one that
 * slipped through would keep retrying against a list the server will refuse.
 */
let readOnlyListIds = new Set<string>();

// --- Persistence ---

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {}
}

function restore(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      queue = JSON.parse(raw);
    }
  } catch {
    queue = [];
  }
}

// --- Error classification ---

function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return true;

  const msg = error.message;

  if (msg.includes('API 429')) return true;
  if (msg.includes('API 4')) return false;
  if (msg.includes('API 5')) return true;
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) return true;
  if (msg.includes('timeout') || msg.includes('AbortError')) return true;

  return true;
}

// --- Backoff ---

function getBackoffMs(retryCount: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_BACKOFF_MS);
}

// --- Public API ---

/** Tell the queue which list ids are read-only. Called by useLists. */
export function setReadOnlyLists(ids: Iterable<string>): void {
  readOnlyListIds = new Set(ids);
}

export function isReadOnlyList(listId: string): boolean {
  return readOnlyListIds.has(listId);
}

export function enqueue(action: SyncAction): void {
  const userId = getAuthUserId();
  if (!userId) return; // Demo mode: no server sync

  if (readOnlyListIds.has(action.listId)) {
    console.error('[list-sync] refused a write to a read-only list:', action.type, action.listId);
    return;
  }

  const entry: QueueEntry = {
    id: crypto.randomUUID(),
    action,
    userId,
    createdAt: Date.now(),
    retryCount: 0,
    nextRetryAt: 0,
  };

  queue.push(entry);
  persist();
  scheduleDrain();
}

export function hasPendingCreate(listId: string): boolean {
  return queue.some(e => e.action.type === 'create_list' && e.action.listId === listId);
}

export function hasPendingItemUpsert(listId: string, itemId: string): boolean {
  return queue.some(
    e => e.action.type === 'add_item' && e.action.listId === listId && e.action.payload.id === itemId
  );
}

export function hasPendingForList(listId: string): boolean {
  return queue.some(e => e.action.listId === listId);
}

export function hasPendingDeletion(listId: string, placeId: string): boolean {
  return queue.some(
    e => e.action.type === 'remove_item_by_place' && e.action.listId === listId && e.action.payload.placeId === placeId
  );
}

export function hasPendingItemDeletion(itemId: string): boolean {
  return queue.some(
    e => e.action.type === 'remove_item' && e.action.payload.itemId === itemId
  );
}

export function hasPendingListDeletion(listId: string): boolean {
  return queue.some(
    e => e.action.type === 'delete_list' && e.action.listId === listId
  );
}

export function getQueueSize(): number {
  return queue.length;
}

// --- Processing ---

function scheduleDrain(): void {
  if (drainTimer) return;
  drainTimer = setTimeout(() => {
    drainTimer = null;
    drain();
  }, 100);
}

async function drain(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const now = Date.now();
    const ready = queue.filter(e => e.nextRetryAt <= now);

    for (const entry of ready) {
      // A list can turn read-only while a write to it is still sitting in the
      // queue: the person loses a team, or the list changes hands. The enqueue
      // guard cannot catch that one, because the entry was legitimate when it
      // was made and has since been restored from localStorage. Drop it rather
      // than send a write the server will refuse.
      if (readOnlyListIds.has(entry.action.listId)) {
        console.warn('[list-sync] List is read-only now, dropping:', entry.action.type);
        queue = queue.filter(e => e.id !== entry.id);
        continue;
      }

      // Check dependency: if this is an item operation, list must be created first
      if (entry.action.type !== 'create_list' && entry.action.type !== 'delete_list') {
        const hasPendingListCreate = queue.some(
          e => e.action.type === 'create_list' && e.action.listId === entry.action.listId && e.id !== entry.id
        );
        if (hasPendingListCreate) continue;
      }

      const success = await executeEntry(entry);

      if (success) {
        queue = queue.filter(e => e.id !== entry.id);
      }
    }

    persist();
  } finally {
    processing = false;
  }

  if (queue.length > 0) {
    const nextRetry = Math.min(...queue.map(e => e.nextRetryAt));
    const delay = Math.max(100, nextRetry - Date.now());
    setTimeout(() => drain(), delay);
  }
}

async function executeEntry(entry: QueueEntry): Promise<boolean> {
  try {
    await executeAction(entry.action);
    return true;
  } catch (error) {
    if (!isRetryable(error)) {
      console.warn('[list-sync] Permanent failure, dropping:', entry.action.type, error);
      queue = queue.filter(e => e.id !== entry.id);
      return true; // Removed from queue
    }

    entry.retryCount++;
    entry.nextRetryAt = Date.now() + getBackoffMs(entry.retryCount);
    return false;
  }
}

async function executeAction(action: SyncAction): Promise<void> {
  switch (action.type) {
    case 'create_list':
    case 'rename_list':
      await apiFetch('/api/db/lists', {
        method: 'POST',
        body: JSON.stringify({ action: 'upsert_list', ...action.payload }),
      });
      break;

    case 'add_item':
      await apiFetch('/api/db/lists', {
        method: 'POST',
        body: JSON.stringify({ action: 'upsert_item', ...action.payload }),
      });
      break;

    case 'remove_item':
      await apiFetch(`/api/db/lists?type=item&id=${encodeURIComponent(action.payload.itemId)}`, {
        method: 'DELETE',
      });
      break;

    case 'remove_item_by_place':
      await apiFetch(
        `/api/db/lists?type=item_by_place&id=_&list_id=${encodeURIComponent(action.payload.listId)}&place_id=${encodeURIComponent(action.payload.placeId)}`,
        { method: 'DELETE' }
      );
      break;

    case 'delete_list':
      await apiFetch(`/api/db/lists?type=list&id=${encodeURIComponent(action.payload.listId)}`, {
        method: 'DELETE',
      });
      break;
  }
}

// --- Initialization ---

// Step 1: Restore queue from localStorage so hasPending* checks work during merge.
// Does NOT start draining. Call startDraining() after initial merge completes.
export function initSyncQueue(): void {
  restore();
}

// Step 2: Begin processing queued operations. Call after initial server fetch + merge.
export function startDraining(): void {
  if (queue.length > 0) {
    queue.forEach(e => { e.nextRetryAt = 0; });
    persist();
    scheduleDrain();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      queue.forEach(e => { e.nextRetryAt = 0; });
      scheduleDrain();
    });
  }
}

// Test-only: reset all internal state
export function _resetForTest(): void {
  queue = [];
  processing = false;
  readOnlyListIds = new Set();
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
  }
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
