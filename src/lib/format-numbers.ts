/**
 * Format large numbers in compact form (e.g., 14217.65 → "14.2K")
 * Always uses one decimal place for thousands.
 */
export function formatCompactNumber(value: number): string {
    if (value >= 1000) {
        const compact = (value / 1000).toFixed(1);
        // Remove trailing .0 (e.g., "15.0" → "15")
        const cleaned = compact.endsWith('.0') ? compact.slice(0, -2) : compact;
        return `${cleaned}K`;
    }
    // For values under 1000, show one decimal
    return value.toFixed(1);
}
