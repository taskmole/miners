/** "calle mayor" -> "Calle mayor". Shared by the map card and share links. */
export function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
