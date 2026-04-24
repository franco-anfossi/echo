import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedScheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedScheme;
  setPreference: (pref: ThemePreference) => void;
  isLoaded: boolean;
}

const STORAGE_KEY = 'echo:theme-preference';

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  resolved: 'light',
  setPreference: () => {},
  isLoaded: false,
});

function isValid(pref: string | null): pref is ThemePreference {
  return pref === 'light' || pref === 'dark' || pref === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const device = useDeviceColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (isValid(v)) setPreferenceState(v);
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref);
    AsyncStorage.setItem(STORAGE_KEY, pref).catch(() => {});
  };

  const resolved: ResolvedScheme =
    preference === 'system' ? (device === 'dark' ? 'dark' : 'light') : preference;

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, isLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference(): ThemeContextValue {
  return useContext(ThemeContext);
}
