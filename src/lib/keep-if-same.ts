/**
 * State updater for polls: keep the old value when the new one is identical.
 *
 * A poll that stores a fresh object every minute, even when nothing changed,
 * re-runs everything downstream of it. For the pitch statuses and assignments
 * that is the whole map's property layer, which showed up as a hitch once a
 * minute, sometimes mid-pan. Payloads are small, so a JSON compare is fine.
 *
 * Usage: setThing(prev => keepIfSame(prev, next))
 */
export function keepIfSame<T>(prev: T, next: T): T {
    return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}
