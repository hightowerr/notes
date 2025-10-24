import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { useSessionStorage } from '@/lib/hooks/useSessionStorage';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage and sessionStorage
const createStorageMock = () => {
  let store: { [key: string]: string } = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() {
        return Object.keys(store).length;
    }
  };
};

let localStorageMock = createStorageMock();
let sessionStorageMock = createStorageMock();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should set and get a value from localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));
    
    act(() => {
      result.current[1]('new-value');
    });

    expect(result.current[0]).toBe('new-value');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('test-key', JSON.stringify('new-value'));
  });

  it('should use initial value if nothing is in localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));
    expect(result.current[0]).toBe('initial');
  });

  it('should remove a value from localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('new-value');
    });
    expect(result.current[0]).toBe('new-value');

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe('initial');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('test-key');
  });
});

describe('useSessionStorage', () => {
    beforeEach(() => {
        localStorageMock.clear();
        sessionStorageMock.clear();
        vi.clearAllMocks();
    });

  it('should set and get a value from sessionStorage', () => {
    const { result } = renderHook(() => useSessionStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('new-value');
    });

    expect(result.current[0]).toBe('new-value');
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith('test-key', JSON.stringify('new-value'));
  });

  it('should use initial value if nothing is in sessionStorage', () => {
    const { result } = renderHook(() => useSessionStorage('test-key', 'initial'));
    expect(result.current[0]).toBe('initial');
  });

  it('should remove a value from sessionStorage', () => {
    const { result } = renderHook(() => useSessionStorage('test-key', 'initial'));

    act(() => {
      result.current[1]('new-value');
    });
    expect(result.current[0]).toBe('new-value');

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe('initial');
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('test-key');
  });
});
