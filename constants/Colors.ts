/**
 * Unified "Mainly Blue" Color Palette
 * Based on Slate (neutral-cool) and Blue (primary) scales.
 */

const tintColorLight = '#0061FF';
const tintColorDark = '#60A5FA';

export const Colors = {
  light: {
    text: '#0F172A',        // Slate 900
    background: '#FFFFFF',  // White
    tint: tintColorLight,
    icon: '#64748B',        // Slate 500
    tabIconDefault: '#94A3B8', // Slate 400
    tabIconSelected: tintColorLight,
    
    // Custom Palette
    primary: '#0061FF',     // Vibrant Blue
    secondary: '#E0F2FE',   // Light Sky Blue
    accent: '#F59E0B',      // Amber 500 (Golden)
    surface: '#F8FAFC',     // Slate 50 (Very light cool grey)
    inputBackground: '#F1F5F9', // Slate 100
    border: '#E2E8F0',      // Slate 200
    subtext: '#64748B',     // Slate 500
    
    // Semantic
    success: '#059669',     // Emerald 600
    error: '#DC2626',       // Red 600
    warning: '#D97706',     // Amber 600 (for "A mejorar" status)
  },
  dark: {
    text: '#F8FAFC',        // Slate 50
    background: '#020617',  // Slate 950 (Deep Blue-Black)
    tint: tintColorDark,
    icon: '#94A3B8',        // Slate 400
    tabIconDefault: '#475569', // Slate 600
    tabIconSelected: tintColorDark,

    // Custom Palette
    primary: '#3B82F6',     // Blue 500
    secondary: '#172554',   // Blue 950
    accent: '#FBBF24',      // Amber 400
    surface: '#0F172A',     // Slate 900
    inputBackground: '#1E293B', // Slate 800
    border: '#1E293B',      // Slate 800
    subtext: '#94A3B8',     // Slate 400

    // Semantic
    success: '#34D399',     // Emerald 400
    error: '#F87171',       // Red 400
    warning: '#FBBF24',     // Amber 400
  },
};
