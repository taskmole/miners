// Check if a date string is within the last 3 months
export function isRecentlyAdded(dateStr?: string): boolean {
    if (!dateStr) return false;
    const published = new Date(dateStr);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return published >= threeMonthsAgo;
}

// Check if a POI was added within the last N days (default 30)
// Used for the "New" filter across all POI types
export function isNewPoi(dateStr?: string, daysThreshold = 30): boolean {
    if (!dateStr) return false;
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return false;
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);
        return date >= thresholdDate;
    } catch {
        return false;
    }
}
