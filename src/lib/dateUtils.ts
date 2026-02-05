// Check if a date string is within the last 3 months
export function isRecentlyAdded(dateStr?: string): boolean {
    if (!dateStr) return false;
    const published = new Date(dateStr);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return published >= threeMonthsAgo;
}
