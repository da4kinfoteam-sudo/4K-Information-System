import { useState, useEffect } from 'react';

function useLocalStorageState<T>(key: string, defaultValue: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        try {
            const storedValue = localStorage.getItem(key);
            if (storedValue) {
                return JSON.parse(storedValue);
            }
        } catch (error) {
            console.error("Error reading from localStorage", error);
        }
        
        if (typeof defaultValue === 'function') {
            return (defaultValue as () => T)();
        }
        return defaultValue;
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.error("Error writing to localStorage", error);
        }
    }, [key, state]);

    return [state, setState];
}

export default useLocalStorageState;