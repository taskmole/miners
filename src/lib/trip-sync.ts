/**
 * Retry queue for trip (pitch) sync operations.
 * All server writes go through this queue to guarantee delivery.
 * Modeled after list-sync.ts but simplified: trips are a single entity
 * with no parent-child dependencies.
 */

import { apiFetch } from '@/lib/api-client';
import { getAuthUserId } from '@/lib/browser-session';

// --- Types ---

type SyncAction =
  | { type: 'upsert_trip'; tripId: string; payload: Record<string, unknown> }
  | { type: 'delete_trip'; tripId: string; payload: { tripId: string } };

interface QueueEntry {
  id: string;
  action: SyncAction;
  userId: string;
  createdAt: number;
  retryCount: number;
  nextRetryAt: number;
}

// --- Constants ---

const STORAGE_KEY = 'miners_trip_sync_queue';
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
  if (!userId) return;

  // Deduplicate: remove stale entries for the same trip.
  // For upserts, only the latest state matters. For deletes, pending upserts are pointless.
  if (action.type === 'upsert_trip') {
    queue = queue.filter(
      e => !(e.action.type === 'upsert_trip' && e.action.tripId === action.tripId)
    );
  } else if (action.type === 'delete_trip') {
    queue = queue.filter(e => e.action.tripId !== action.tripId);
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

export function hasPendingUpsert(tripId: string): boolean {
  return queue.some(e => e.action.type === 'upsert_trip' && e.action.tripId === tripId);
}

export function hasPendingDelete(tripId: string): boolean {
  return queue.some(e => e.action.type === 'delete_trip' && e.action.tripId === tripId);
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
      console.warn('[trip-sync] Permanent failure, dropping:', entry.action.type, error);
      queue = queue.filter(e => e.id !== entry.id);
      return true;
    }

    entry.retryCount++;
    entry.nextRetryAt = Date.now() + getBackoffMs(entry.retryCount);
    return false;
  }
}

async function executeAction(action: SyncAction): Promise<void> {
  switch (action.type) {
    case 'upsert_trip':
      await apiFetch('/api/db/pitches', {
        method: 'POST',
        body: JSON.stringify(action.payload),
      });
      break;

    case 'delete_trip':
      await apiFetch(`/api/db/pitches?id=${encodeURIComponent(action.tripId)}`, {
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
