"use client";

import React, { createContext, useContext, type ReactNode } from 'react';
import { usePropertyAssignments, type PropertyAssignment, type AssignableUser } from '@/hooks/usePropertyAssignments';

interface PropertyAssignmentContextValue {
  isLoaded: boolean;
  assignments: PropertyAssignment[];
  users: AssignableUser[];
  getAssignment: (placeId: string) => PropertyAssignment | null;
  isAssignedToMe: (placeId: string) => boolean;
  canPitch: (placeId: string) => { allowed: boolean; reason: string | null };
  myAssignmentCount: number;
  assignProperty: (placeId: string, assignedTo: string, notes?: string) => Promise<PropertyAssignment>;
  preRejectProperty: (placeId: string, reason: string, notes?: string) => Promise<PropertyAssignment>;
  removeAssignment: (placeId: string) => Promise<void>;
  refreshAssignments: () => Promise<void>;
}

const PropertyAssignmentContext = createContext<PropertyAssignmentContextValue | null>(null);

export function PropertyAssignmentProvider({ children }: { children: ReactNode }) {
  const hook = usePropertyAssignments();

  return (
    <PropertyAssignmentContext.Provider value={hook}>
      {children}
    </PropertyAssignmentContext.Provider>
  );
}

export function usePropertyAssignmentContext(): PropertyAssignmentContextValue {
  const context = useContext(PropertyAssignmentContext);
  if (!context) {
    throw new Error('usePropertyAssignmentContext must be used within a PropertyAssignmentProvider');
  }
  return context;
}
