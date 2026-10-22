/**
 * The next listing nobody has ticked off yet in the new listings popup,
 * searching forward from `from` and wrapping round to the start. -1 when
 * every one has been seen.
 */
export function nextUnseenIndex(
  deck: readonly { id: string }[],
  from: number,
  seen: ReadonlySet<string>,
): number {
  for (let step = 1; step <= deck.length; step++) {
    const i = (from + step) % deck.length;
    if (!seen.has(deck[i].id)) return i;
  }
  return -1;
}
