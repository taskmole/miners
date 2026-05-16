import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock list-sync module
vi.mock('@/lib/list-sync', () => ({
  enqueue: vi.fn(),
  hasPendingCreate: vi.fn(),
  hasPendingItemUpsert: vi.fn(),
  hasPendingForList: vi.fn(),
  getQueueSize: vi.fn(() => 0),
  initSyncQueue: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/browser-session', () => ({
  getAuthUserId: vi.fn(() => 'user-123'),
  getCurrentUserId: vi.fn(() => 'user-123'),
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  logActivity: vi.fn(),
}));

import { hasPendingCreate, hasPendingItemUpsert } from '@/lib/list-sync';
import type { LocationList } from '@/types/lists';

const mockHasPendingCreate = vi.mocked(hasPendingCreate);
const mockHasPendingItemUpsert = vi.mocked(hasPendingItemUpsert);

// We test the merge logic directly by extracting it
// Since mergeLists is not exported, we replicate it here for testing
function mergeLists(
  serverLists: LocationList[],
  localLists: LocationList[],
): LocationList[] {
  const localListsMap = new Map(localLists.map(l => [l.id, l]));
  const serverListIds = new Set(serverLists.map(l => l.id));
  const merged: LocationList[] = [];

  for (const serverList of serverLists) {
    const localList = localListsMap.get(serverList.id);
    const serverItemIds = new Set(serverList.items.map(i => i.id));
    const pendingLocalItems: any[] = [];

    if (localList) {
      for (const localItem of localList.items) {
        if (!serverItemIds.has(localItem.id) && hasPendingItemUpsert(serverList.id, localItem.id)) {
          pendingLocalItems.push(localItem);
        }
      }
    }

    merged.push({
      ...serverList,
      items: [...serverList.items, ...pendingLocalItems],
      drawnAreas: localList?.drawnAreas || [],
    });
  }

  for (const localList of localLists) {
    if (!serverListIds.has(localList.id) && hasPendingCreate(localList.id)) {
      merged.push(localList);
    }
  }

  return merged;
}

describe('mergeLists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasPendingCreate.mockReturnValue(false);
    mockHasPendingItemUpsert.mockReturnValue(false);
  });

  it('server lists are preserved in merge result', () => {
    const serverLists: LocationList[] = [
      { id: 'list-1', name: 'Server List', createdAt: '2026-01-01', items: [], drawnAreas: [] },
    ];

    const result = mergeLists(serverLists, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Server List');
  });

  it('local-only list with pending create is kept', () => {
    mockHasPendingCreate.mockImplementation((id) => id === 'local-1');

    const serverLists: LocationList[] = [];
    const localLists: LocationList[] = [
      { id: 'local-1', name: 'Unsaved List', createdAt: '2026-01-01', items: [], drawnAreas: [] },
    ];

    const result = mergeLists(serverLists, localLists);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Unsaved List');
  });

  it('local-only list without pending create is discarded', () => {
    mockHasPendingCreate.mockReturnValue(false);

    const serverLists: LocationList[] = [];
    const localLists: LocationList[] = [
      { id: 'orphan-1', name: 'Orphan List', createdAt: '2026-01-01', items: [], drawnAreas: [] },
    ];

    const result = mergeLists(serverLists, localLists);
    expect(result).toHaveLength(0);
  });

  it('local items with pending upsert are preserved during merge', () => {
    mockHasPendingItemUpsert.mockImplementation((listId, itemId) => itemId === 'pending-item');

    const serverLists: LocationList[] = [
      {
        id: 'list-1',
        name: 'Server List',
        createdAt: '2026-01-01',
        items: [{ id: 'server-item', placeId: 'cafe-1', placeType: 'cafe', placeName: 'Cafe 1', placeAddress: '', lat: 50, lon: 14, addedAt: '2026-01-01' }],
        drawnAreas: [],
      },
    ];
    const localLists: LocationList[] = [
      {
        id: 'list-1',
        name: 'Server List',
        createdAt: '2026-01-01',
        items: [
          { id: 'server-item', placeId: 'cafe-1', placeType: 'cafe', placeName: 'Cafe 1', placeAddress: '', lat: 50, lon: 14, addedAt: '2026-01-01' },
          { id: 'pending-item', placeId: 'cafe-2', placeType: 'cafe', placeName: 'Cafe 2', placeAddress: '', lat: 51, lon: 15, addedAt: '2026-01-01' },
        ],
        drawnAreas: [],
      },
    ];

    const result = mergeLists(serverLists, localLists);
    expect(result[0].items).toHaveLength(2);
    expect(result[0].items.map(i => i.id)).toContain('pending-item');
  });

  it('local items without pending upsert are discarded', () => {
    mockHasPendingItemUpsert.mockReturnValue(false);

    const serverLists: LocationList[] = [
      { id: 'list-1', name: 'Server List', createdAt: '2026-01-01', items: [], drawnAreas: [] },
    ];
    const localLists: LocationList[] = [
      {
        id: 'list-1',
        name: 'Server List',
        createdAt: '2026-01-01',
        items: [{ id: 'stale-item', placeId: 'cafe-1', placeType: 'cafe', placeName: 'Gone Cafe', placeAddress: '', lat: 50, lon: 14, addedAt: '2026-01-01' }],
        drawnAreas: [],
      },
    ];

    const result = mergeLists(serverLists, localLists);
    expect(result[0].items).toHaveLength(0);
  });

  it('empty server success produces empty result (no resurrection)', () => {
    const serverLists: LocationList[] = [];
    const localLists: LocationList[] = [
      { id: 'deleted-list', name: 'Should Be Gone', createdAt: '2026-01-01', items: [], drawnAreas: [] },
    ];

    const result = mergeLists(serverLists, localLists);
    expect(result).toHaveLength(0);
  });

  it('preserves local drawnAreas on server lists', () => {
    const serverLists: LocationList[] = [
      { id: 'list-1', name: 'My List', createdAt: '2026-01-01', items: [], drawnAreas: [] },
    ];
    const localLists: LocationList[] = [
      {
        id: 'list-1',
        name: 'My List',
        createdAt: '2026-01-01',
        items: [],
        drawnAreas: [{ id: 'area-1', areaId: 'drawn-1', areaType: 'polygon', name: 'Zone A', addedAt: '2026-01-01' }],
      },
    ];

    const result = mergeLists(serverLists, localLists);
    expect(result[0].drawnAreas).toHaveLength(1);
    expect(result[0].drawnAreas![0].name).toBe('Zone A');
  });
});
