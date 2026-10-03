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

  // Delete a specific feature by ID. Goes through the context so the delete is
  // saved: deleting straight on the draw instance fires no event and would not be.
  const deleteFeatureById = (featureId: string) => {
    deleteFeature(featureId);
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
    deleteFeatureById,
    getAll,
    exportGeoJSON,
    clearSelection,
  };
}
