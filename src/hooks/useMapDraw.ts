import { useMapDraw as useMapDrawContext } from '@/components/ui/map-draw';
import type { DrawMode } from '@/types/draw';

/**
 * Hook for interacting with MapboxDraw functionality
 * Provides methods to change drawing modes, delete features, and export data
 */
export function useMapDraw() {
  const { draw, mode, features, selectedFeatureIds, deleteFeature, clearSelection } = useMapDrawContext();

  const changeMode = (newMode: DrawMode) => {
    if (!draw) return;
    try {
      // Cast to any because MapboxDraw types don't match our DrawMode type
      (draw as any).changeMode(newMode);
    } catch (error) {
      console.error('Error changing mode:', error);
    }
  };

  const deleteSelected = () => {
    if (!draw || selectedFeatureIds.length === 0) return;
    try {
      draw.delete(selectedFeatureIds);
    } catch (error) {
      console.error('Error deleting features:', error);
    }
  };

  // Delete a specific feature by ID (uses context function to ensure localStorage is updated)
  const deleteFeatureById = (featureId: string) => {
    deleteFeature(featureId);
  };

  const clearAll = () => {
    if (!draw) return;
    try {
      draw.deleteAll();
    } catch (error) {
      console.error('Error clearing all features:', error);
    }
  };

  const getAll = () => {
    if (!draw) return null;
    try {
      return draw.getAll();
    } catch (error) {
      console.error('Error getting features:', error);
      return null;
    }
  };

  const exportGeoJSON = () => {
    const allFeatures = getAll();
    if (!allFeatures) return;

    const dataStr = JSON.stringify(allFeatures, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `miners-drawn-features-${Date.now()}.geojson`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  /**
   * Update properties on a specific feature
   * Used to set custom colors and other metadata
   * Note: MapboxDraw stores user properties with 'user_' prefix
   */
  const updateFeatureProperties = (featureId: string, properties: Record<string, any>) => {
    if (!draw) return;
    try {
      const feature = draw.get(featureId);
      if (feature) {
        // MapboxDraw requires delete + add to update properties
        // Add user_ prefix to properties for MapboxDraw styling to work
        const userPrefixedProps: Record<string, any> = {};
        for (const [key, value] of Object.entries(properties)) {
          userPrefixedProps[`user_${key}`] = value;
        }

        const updatedFeature = {
          ...feature,
          properties: { ...feature.properties, ...userPrefixedProps }
        };
        draw.delete(featureId);
        draw.add(updatedFeature);
      }
    } catch (error) {
      console.error('Error updating feature properties:', error);
    }
  };

  return {
    draw,
    mode,
    features,
    selectedFeatureIds,
    changeMode,
    deleteSelected,
    deleteFeatureById,
    clearAll,
    getAll,
    exportGeoJSON,
    updateFeatureProperties,
    clearSelection,
  };
}
