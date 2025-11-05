import { useState, useEffect, useCallback } from 'react';

type SetValue<T> = (value: T | ((val: T) => T)) => void;
type RemoveValue = () => void;

export function useLocalStorage<T>(key: string, initialValue: T): [T, SetValue<T>, RemoveValue] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue: SetValue<T> = useCallback((value) => {
    try {
      setStoredValue((prevStoredValue) => {
        const valueToStore = value instanceof Function ? value(prevStoredValue) : value;
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
        return valueToStore;
      });
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        console.error(`LocalStorage quota exceeded for key "${key}"`);
      } else {
        console.error(error);
      }
    }
  }, [key]);

  const removeValue: RemoveValue = useCallback(() => {
    try {
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(key);
            setStoredValue(initialValue);
        }
    } catch (error) {
        console.error(error);
    }
  }, [key, initialValue]);
  
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.storageArea === window.localStorage && e.key === key) {
        try {
          setStoredValue(e.newValue ? JSON.parse(e.newValue) : initialValue);
        } catch (error) {
          console.error(error);
          setStoredValue(initialValue);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
