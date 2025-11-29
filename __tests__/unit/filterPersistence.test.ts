import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadFilterPreference, saveFilterPreference } from '@/lib/services/filterPersistence';
import type { SortingStrategy } from '@/lib/schemas/sortingStrategy';

// Mock localStorage since these are unit tests
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Filter Persistence Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  describe('loadFilterPreference', () => {
    it('returns focus_mode on first load (no stored preference)', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const result = loadFilterPreference();

      expect(result).toBe('focus_mode');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('task-filter-preference');
    });

    it('loads valid stored preference correctly', () => {
      const storedValue = {
        strategy: 'quick_wins' as SortingStrategy,
        savedAt: Date.now(),
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(storedValue));

      const result = loadFilterPreference();

      expect(result).toBe('quick_wins');
    });

    it('falls back to focus_mode on JSON parse error', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json{');

      const result = loadFilterPreference();

      expect(result).toBe('focus_mode');
    });

    it('falls back to focus_mode on invalid strategy value', () => {
      const invalidValue = {
        strategy: 'invalid_strategy',
        savedAt: Date.now(),
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(invalidValue));

      const result = loadFilterPreference();

      expect(result).toBe('focus_mode');
    });

    it('returns focus_mode in SSR environment (no window)', () => {
      // Mock SSR environment
      vi.stubGlobal('window', undefined);

      const result = loadFilterPreference();

      expect(result).toBe('focus_mode');
      
      // Restore window for other tests
      vi.unstubAllGlobals();
    });
  });

  describe('saveFilterPreference', () => {
    it('writes preference to localStorage with correct format', () => {
      const strategy: SortingStrategy = 'strategic_bets';
      const mockDate = 1234567890;
      vi.spyOn(Date, 'now').mockReturnValue(mockDate);

      saveFilterPreference(strategy);

      const expectedValue = JSON.stringify({
        strategy: 'strategic_bets',
        savedAt: 1234567890,
      });
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'task-filter-preference',
        expectedValue
      );
    });

    it('supports all valid strategy types', () => {
      const strategies: SortingStrategy[] = ['balanced', 'quick_wins', 'strategic_bets', 'urgent', 'focus_mode'];

      strategies.forEach((strategy) => {
        saveFilterPreference(strategy);
        
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'task-filter-preference',
          expect.stringContaining(`"strategy":"${strategy}"`)
        );
      });
    });

    it('handles SSR environment gracefully (no window)', () => {
      // Mock SSR environment
      vi.stubGlobal('window', undefined);

      // Should not throw error
      expect(() => {
        saveFilterPreference('focus_mode');
      }).not.toThrow();

      // Should not call setItem
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
      
      // Restore window for other tests
      vi.unstubAllGlobals();
    });

    it('includes timestamp for staleness tracking', () => {
      const mockDate = 1609459200000; // 2021-01-01
      vi.spyOn(Date, 'now').mockReturnValue(mockDate);

      saveFilterPreference('focus_mode');

      const captured = localStorageMock.setItem.mock.calls[0][1];
      const parsed = JSON.parse(captured);
      
      expect(parsed.savedAt).toBe(1609459200000);
    });
  });

  describe('integration scenarios', () => {
    it('handles round-trip save and load cycle', () => {
      let storedValue: string | null = null;
      localStorageMock.setItem.mockImplementation((key, value) => {
        storedValue = value;
      });
      localStorageMock.getItem.mockImplementation(() => storedValue);

      // Save preference
      saveFilterPreference('strategic_bets');
      
      // Load preference
      const loaded = loadFilterPreference();

      expect(loaded).toBe('strategic_bets');
    });

    it('preserves timestamp during round-trip', () => {
      let storedValue: string | null = null;
      const mockDate = 1609459200000;
      vi.spyOn(Date, 'now').mockReturnValue(mockDate);
      
      localStorageMock.setItem.mockImplementation((key, value) => {
        storedValue = value;
      });
      localStorageMock.getItem.mockImplementation(() => storedValue);

      saveFilterPreference('quick_wins');
      
      // Verify timestamp is preserved
      const parsed = JSON.parse(storedValue!);
      expect(parsed.savedAt).toBe(1609459200000);
    });
  });
});