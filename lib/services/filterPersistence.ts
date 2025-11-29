import { SortingStrategySchema, type SortingStrategy } from '@/lib/schemas/sortingStrategy';

/**
 * Filter preference storage format
 */
type FilterPreference = {
  strategy: SortingStrategy;
  savedAt: number;
};

/**
 * Storage key for localStorage
 */
const STORAGE_KEY = 'task-filter-preference';

/**
 * Default filter strategy for new users
 */
const DEFAULT_STRATEGY: SortingStrategy = 'focus_mode';

/**
 * Load filter preference from localStorage with error handling
 * 
 * @returns SortingStrategy - Returns 'focus_mode' as default for new users
 *                           or on any error (JSON parse failure, invalid data)
 */
export const loadFilterPreference = (): SortingStrategy => {
  // Handle SSR environment (no window object)
  if (typeof window === 'undefined') {
    return DEFAULT_STRATEGY;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    
    if (!stored) {
      // First-time user - default to focus_mode
      return DEFAULT_STRATEGY;
    }

    const parsed = JSON.parse(stored) as FilterPreference;
    
    // Validate the strategy using Zod schema
    const validatedStrategy = SortingStrategySchema.parse(parsed.strategy);
    
    return validatedStrategy;
  } catch (error) {
    // Handle JSON parse errors, validation errors, or any other exceptions
    // Fail gracefully by returning default
    console.warn('[FilterPersistence] Failed to load preference, using default:', error);
    return DEFAULT_STRATEGY;
  }
};

/**
 * Save filter preference to localStorage with error handling
 * 
 * @param strategy - The sorting strategy to persist
 */
export const saveFilterPreference = (strategy: SortingStrategy): void => {
  // Handle SSR environment (no window object)
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const preference: FilterPreference = {
      strategy,
      savedAt: Date.now(),
    };

    const serialized = JSON.stringify(preference);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    // Handle localStorage quota exceeded, disabled localStorage, or other errors
    // Fail gracefully - app continues to work without persistence
    console.warn('[FilterPersistence] Failed to save preference:', error);
  }
};

/**
 * Clear stored filter preference (for testing or reset functionality)
 */
export const clearFilterPreference = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[FilterPersistence] Failed to clear preference:', error);
  }
};

/**
 * Check if a filter preference exists in storage
 * 
 * @returns boolean - True if preference exists, false otherwise
 */
export const hasStoredPreference = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null;
  } catch (error) {
    return false;
  }
};