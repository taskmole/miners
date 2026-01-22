// Types for point categories feature

// Storage key for localStorage
export const POINT_CATEGORIES_STORAGE_KEY = 'miners-point-categories';

// Point category interface
export interface PointCategory {
  id: string;
  name: string;
  isSystem: boolean;  // System categories cannot be deleted
  createdAt: string;  // ISO timestamp
}

// Default system categories - these cannot be deleted
export const DEFAULT_CATEGORIES: PointCategory[] = [
  { id: 'cat-cafe', name: 'Cafe', isSystem: true, createdAt: new Date().toISOString() },
  { id: 'cat-places-for-rent', name: 'Places for Rent', isSystem: true, createdAt: new Date().toISOString() },
  { id: 'cat-business-area', name: 'Business Area', isSystem: true, createdAt: new Date().toISOString() },
  { id: 'cat-shopping-area', name: 'Shopping Area', isSystem: true, createdAt: new Date().toISOString() },
  { id: 'cat-high-street', name: 'High Street', isSystem: true, createdAt: new Date().toISOString() },
  { id: 'cat-student-dormitory', name: 'Student Dormitory', isSystem: true, createdAt: new Date().toISOString() },
  { id: 'cat-university', name: 'University', isSystem: true, createdAt: new Date().toISOString() },
];
