import { useMapDraw as useMapDrawContext } from '@/components/ui/map-draw';
import type { DrawMode } from '@/types/draw';

/**
 * Hook for interacting with MapboxDraw functionality
 * Provides methods to change drawing modes, delete features, and export data
 */
export function useMapDraw() {
  const { draw, mode, features, selectedFeatureIds } = useMapDrawContext();

  const changeMode = (newMode: DrawMode) => {
    if (!draw) return;
    try {
      draw.changeMode(newMode);
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

  return {
    draw,
    mode,
    features,
    selectedFeatureIds,
    changeMode,
    deleteSelected,
    clearAll,
    getAll,
    exportGeoJSON,
  };
}
