import { apiFetch } from '@/lib/api-client';

/**
 * Saving map shapes.
 *
 * Each draw event saves only the shapes it touched. This used to save every
 * shape on screen and then delete every saved shape that was not on screen,
 * so a tab that had not loaded, or was out of date, wiped the person's other
 * shapes the next time they drew.
 *
 * Changes wait here until the server confirms them. One that fails (a
 * network blip, say) stays here and goes out again with the next change or
 * when the browser comes back online, and only the latest version of each
 * shape is ever sent. Writes go one at a time, so a quick draw-then-delete
 * can never land out of order and bring the shape back.
 *
 * Only geometry is sent. Metadata (name, color, tags) is owned by
 * ShapeComments via RPC, and the server stamps the owner from the session.
 */
const unsaved = new Map<string, GeoJSON.Feature>();
const undeleted = new Set<string>();
let queue: Promise<void> = Promise.resolve();

export function saveShapes(shapes: GeoJSON.Feature[]) {
  for (const f of shapes) {
    unsaved.set(f.id as string, f);
    undeleted.delete(f.id as string);
  }
  return flush();
}

export function removeShapes(ids: string[]) {
  for (const id of ids) {
    undeleted.add(id);
    unsaved.delete(id);
  }
  return flush();
}

function flush() {
  queue = queue.then(send);
  return queue;
}

async function send() {
  if (unsaved.size > 0) {
    const batch = [...unsaved.values()];
    const rows = batch.map(f => ({ id: f.id, geojson: f, updated_at: new Date().toISOString() }));
    try {
      await apiFetch('/api/db/drawn-features', {
        method: 'POST',
        body: JSON.stringify({ action: 'upsert_geometry', rows }),
      });
      // A shape edited again while this was in flight stays queued.
      for (const f of batch) {
        if (unsaved.get(f.id as string) === f) unsaved.delete(f.id as string);
      }
    } catch (error) {
      console.error('Error saving shapes:', error);
    }
  }

  if (undeleted.size > 0) {
    const ids = [...undeleted];
    try {
      await apiFetch(`/api/db/drawn-features?ids=${encodeURIComponent(ids.join(','))}`, { method: 'DELETE' });
      for (const id of ids) undeleted.delete(id);
    } catch (error) {
      console.error('Error deleting shapes:', error);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flush(); });
}
