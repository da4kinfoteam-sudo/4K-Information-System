export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = '4kis-theme-preference';

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark';

export const getSavedThemePreference = (): ThemeMode | null => {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        return isThemeMode(stored) ? stored : null;
    } catch {
        return null;
    }
};

export const getSystemThemePreference = (): ThemeMode => {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
};

export const resolveInitialTheme = (): ThemeMode => {
    return getSavedThemePreference() ?? getSystemThemePreference();
};

export const saveThemePreference = (theme: ThemeMode) => {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Theme persistence is a convenience; the active theme still applies.
    }
};

export const applyTheme = (theme: ThemeMode) => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
};
