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

export function enqueue(action: SyncAction): void {
  const userId = getAuthUserId();
  if (!userId) return; // Demo mode: no server sync

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
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
  }
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
