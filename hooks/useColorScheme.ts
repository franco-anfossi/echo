import { useThemePreference } from '@/ctx/ThemeContext';

export function useColorScheme(): 'light' | 'dark' {
  return useThemePreference().resolved;
}
