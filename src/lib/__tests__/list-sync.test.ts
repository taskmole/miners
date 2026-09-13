import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/browser-session', () => ({
  getAuthUserId: vi.fn(),
}));

import { enqueue, hasPendingCreate, hasPendingItemUpsert, getQueueSize, initSyncQueue, isReadOnlyList, setReadOnlyLists, startDraining, _resetForTest } from '../list-sync';
import { getAuthUserId } from '@/lib/browser-session';
import { apiFetch } from '@/lib/api-client';

const mockGetAuthUserId = vi.mocked(getAuthUserId);
const mockApiFetch = vi.mocked(apiFetch);

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => `test-${Math.random().toString(36).slice(2)}` },
});

describe('list-sync retry queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    localStorageMock.clear();
    mockGetAuthUserId.mockReturnValue('user-123');
    mockApiFetch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('auth guard', () => {
    it('skips queueing when user is not authenticated (demo mode)', () => {
      mockGetAuthUserId.mockReturnValue(null);

      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'anon', created_at: '2026-01-01' },
      });

      expect(getQueueSize()).toBe(0);
    });

    it('queues when user is authenticated', () => {
      mockGetAuthUserId.mockReturnValue('user-123');

      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' },
      });

      expect(getQueueSize()).toBe(1);
    });
  });

  describe('dependency ordering', () => {
    it('reports pending create for a list', () => {
      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' },
      });

      expect(hasPendingCreate('list-1')).toBe(true);
      expect(hasPendingCreate('list-2')).toBe(false);
    });

    it('reports pending item upsert', () => {
      enqueue({
        type: 'add_item',
        listId: 'list-1',
        payload: {
          id: 'item-1',
          list_id: 'list-1',
          place_id: 'cafe-50-14',
          place_type: 'cafe',
          place_name: 'Test Cafe',
          place_address: '123 Street',
          lat: 50,
          lon: 14,
          added_at: '2026-01-01',
        },
      });

      expect(hasPendingItemUpsert('list-1', 'item-1')).toBe(true);
      expect(hasPendingItemUpsert('list-1', 'item-2')).toBe(false);
    });
  });

  describe('error classification', () => {
    it('retries on 500 server error', async () => {
      mockApiFetch.mockRejectedValueOnce(new Error('API 500: Internal Server Error'));
      mockApiFetch.mockResolvedValueOnce(undefined);

      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' },
      });

      // Run all timers (initial drain + backoff retry) until queue is empty
      await vi.runAllTimersAsync();
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      expect(getQueueSize()).toBe(0);
    });

    it('drops on 400 permanent error', async () => {
      mockApiFetch.mockRejectedValue(new Error('API 400: Bad Request'));

      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' },
      });

      await vi.advanceTimersByTimeAsync(200);
      expect(getQueueSize()).toBe(0); // Dropped immediately
    });

    it('drops on 401 auth error', async () => {
      mockApiFetch.mockRejectedValue(new Error('API 401: Unauthorized'));

      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' },
      });

      await vi.advanceTimersByTimeAsync(200);
      expect(getQueueSize()).toBe(0);
    });
  });

  describe('queue persistence', () => {
    it('persists queue to localStorage on enqueue', () => {
      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' },
      });

      const stored = localStorageMock.getItem('miners_sync_queue');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].action.type).toBe('create_list');
    });

    it('restores queue from localStorage on init', () => {
      const entry = [{
        id: 'entry-1',
        action: { type: 'create_list', listId: 'list-1', payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' } },
        userId: 'user-123',
        createdAt: Date.now(),
        retryCount: 0,
        nextRetryAt: Date.now() + 99999,
      }];
      localStorageMock.setItem('miners_sync_queue', JSON.stringify(entry));

      initSyncQueue(); // Restores only, doesn't drain

      expect(hasPendingCreate('list-1')).toBe(true);
    });

    it('does not drain until startDraining is called', () => {
      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' },
      });

      // Re-init without draining
      _resetForTest();
      localStorageMock.setItem('miners_sync_queue', JSON.stringify([{
        id: 'entry-1',
        action: { type: 'create_list', listId: 'list-1', payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' } },
        userId: 'user-123',
        createdAt: Date.now(),
        retryCount: 0,
        nextRetryAt: 0,
      }]));

      initSyncQueue();

      // Queue is restored but no drain scheduled yet
      expect(hasPendingCreate('list-1')).toBe(true);
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe('exponential backoff', () => {
    it('retries with increasing backoff until success', async () => {
      let callCount = 0;
      mockApiFetch.mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) throw new Error('API 500: Server Error');
        return undefined;
      });

      enqueue({
        type: 'create_list',
        listId: 'list-1',
        payload: { id: 'list-1', name: 'Test', created_by: 'user-123', created_at: '2026-01-01' },
      });

      // Run all timers until queue drains (fails 3x, succeeds 4th)
      await vi.runAllTimersAsync();
      expect(callCount).toBe(4);
      expect(getQueueSize()).toBe(0);
    });
  });
});

/**
 * A read-only list is somebody else's. The panel hides every control that
 * would write to one, so nothing should reach the queue. This is the backstop
 * that makes that a guarantee, and it has to run twice: once at enqueue, and
 * again at drain, because a queued write survives a reload and the list may
 * have changed hands in between.
 */
describe('read-only lists', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetForTest();
    localStorageMock.clear();
    mockGetAuthUserId.mockReturnValue('user-123');
    mockApiFetch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('refuses every write to a read-only list id', () => {
    setReadOnlyLists(['their-list']);
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    enqueue({ type: 'rename_list', listId: 'their-list', payload: { id: 'their-list', name: 'Nope', created_by: 'user-123' } });
    enqueue({ type: 'delete_list', listId: 'their-list', payload: { listId: 'their-list' } });
    enqueue({
      type: 'add_item',
      listId: 'their-list',
      payload: { id: 'i-1', list_id: 'their-list', place_id: 'cafe-1', place_type: 'cafe', place_name: 'C', place_address: '', lat: 0, lon: 0, added_at: '2026-01-01' },
    });
    enqueue({ type: 'remove_item', listId: 'their-list', payload: { itemId: 'i-1' } });

    expect(getQueueSize()).toBe(0);
    quiet.mockRestore();
  });

  it('still queues writes to the caller\'s own lists', () => {
    setReadOnlyLists(['their-list']);

    enqueue({ type: 'rename_list', listId: 'my-list', payload: { id: 'my-list', name: 'Fine', created_by: 'user-123' } });

    expect(getQueueSize()).toBe(1);
  });

  it('forgets the old set when the server sends a new one', () => {
    setReadOnlyLists(['list-a']);
    expect(isReadOnlyList('list-a')).toBe(true);

    setReadOnlyLists(['list-b']);
    expect(isReadOnlyList('list-a')).toBe(false);
    expect(isReadOnlyList('list-b')).toBe(true);
  });

  /**
   * The enqueue guard cannot catch this one. The write was legitimate when it
   * was made, sat in the queue through a reload, and by the time it flushes the
   * list has changed hands or the person has left the team. Without a check at
   * drain time the entry goes out anyway.
   */
  it('drops a queued write to a list that turned read-only meanwhile', async () => {
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Queued while the list was still the caller's to write to.
    enqueue({ type: 'rename_list', listId: 'was-mine', payload: { id: 'was-mine', name: 'Later', created_by: 'user-123' } });
    expect(getQueueSize()).toBe(1);

    // The next poll says it is somebody else's now, before the queue flushes.
    setReadOnlyLists(['was-mine']);
    startDraining();
    await vi.advanceTimersByTimeAsync(200);

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(getQueueSize()).toBe(0);
    quiet.mockRestore();
  });

  it('still sends a queued write to a list that stayed writable', async () => {
    enqueue({ type: 'rename_list', listId: 'still-mine', payload: { id: 'still-mine', name: 'Later', created_by: 'user-123' } });

    setReadOnlyLists(['someone-elses']);
    startDraining();
    await vi.advanceTimersByTimeAsync(200);

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(getQueueSize()).toBe(0);
  });
});
