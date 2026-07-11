// Theme tokens from docs/THEME.md — "minimal Claude app" style.
import { useColorScheme } from 'react-native';

export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  accent: string;
  accentSoft: string;
  success: string;
  danger: string;
}

export const light: Palette = {
  bg: '#FAF9F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EEE6',
  text: '#1F1E1D',
  textMuted: '#6E6C66',
  textFaint: '#9C9A93',
  border: '#E8E6E0',
  accent: '#D97757',
  accentSoft: '#F5E8E2',
  success: '#5E8C61',
  danger: '#C0392B',
};

export const dark: Palette = {
  bg: '#262624',
  surface: '#30302E',
  surfaceAlt: '#3A3A37',
  text: '#F5F4EF',
  textMuted: '#B8B5AD',
  textFaint: '#807D75',
  border: '#3E3D3A',
  accent: '#D97757',
  accentSoft: '#453832',
  success: '#7FA982',
  danger: '#E06552',
};

export const radius = {
  input: 12,
  card: 16,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  gutter: 20,
} as const;

// Serif display font stack. Georgia exists on iOS/Android/web; RN maps
// unknown families to the platform default, so this degrades gracefully.
export const serif = 'Georgia';

export const fonts = {
  serif,
} as const;

export interface Theme {
  colors: Palette;
  scheme: 'light' | 'dark';
  radius: typeof radius;
  spacing: typeof spacing;
  serif: string;
}

export function useTheme(): Theme {
  const scheme = useColorScheme() ?? 'light';
  const colors = scheme === 'dark' ? dark : light;
  return {
    colors,
    scheme: scheme === 'dark' ? 'dark' : 'light',
    radius,
    spacing,
    serif,
  };
}
