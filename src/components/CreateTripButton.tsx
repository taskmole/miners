"use client";

import React from 'react';
import { Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScoutingTrips } from '@/hooks/useScoutingTrips';
import type { LinkedItem } from '@/types/scouting';

// Props for the property to scout
export interface PropertyInfo {
  id: string;
  name: string;
  address?: string;
  type: 'place' | 'area';
  data?: any; // Full POI object for fast navigation
}

interface CreateTripButtonProps {
  property: PropertyInfo;
  cityId: string;
  variant?: 'default' | 'compact';
  onClose?: () => void; // Optional callback to close the parent popup
}

/**
 * CreateTripButton - Button for creating a scouting trip from a property
 * Appears in property popups next to "Add to list"
 * Creates the trip and dispatches event to open the form
 */
export function CreateTripButton({ property, cityId, variant = 'default', onClose }: CreateTripButtonProps) {
  const { createTrip, updateTrip } = useScoutingTrips();

  const handleClick = () => {
    // Close the parent popup first (so the trip form isn't hidden behind it)
    onClose?.();

    // Create new trip
    const trip = createTrip(cityId);

    // Create LinkedItem from property info
    const linkedItem: LinkedItem = {
      type: property.type,
      id: property.id,
      name: property.name,
      address: property.address,
      data: property.data,
    };

    // Update trip with property and name
    updateTrip(trip.id, {
      name: property.name,
      property: linkedItem,
    });

    // Dispatch event to open the scouting form with this trip
    window.dispatchEvent(
      new CustomEvent('create-trip-from-property', {
        detail: { trip: { ...trip, name: property.name, property: linkedItem } },
      })
    );
  };

  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        className="h-auto py-1 px-2 text-xs"
      >
        <Route className="h-3.5 w-3.5 mr-1" />
        Scout
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      className="h-auto py-1 px-2"
    >
      <Route className="h-3.5 w-3.5" />
      <span>Create trip</span>
    </Button>
  );
}
