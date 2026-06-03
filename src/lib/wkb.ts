export function parseWkbPoint(hex: string): { lat: number; lon: number } | null {
  if (!hex || hex.length < 50) return null;
  const coordHex = hex.slice(18);
  const bytes = new Uint8Array(
    coordHex.match(/../g)!.map((h: string) => parseInt(h, 16)),
  );
  const view = new DataView(bytes.buffer);
  return { lon: view.getFloat64(0, true), lat: view.getFloat64(8, true) };
}
