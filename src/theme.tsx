import { useColorScheme } from 'react-native';

export type Palette = {
  bg: string; card: string; card2: string; line: string;
  text: string; muted: string; lime: string; onLime: string;
  blue: string; green: string; red: string; amber: string;
};

const DARK: Palette = {
  bg: '#141416', card: '#1e1e22', card2: '#26262b', line: '#2e2e34',
  text: '#ffffff', muted: '#9a9aa3', lime: '#c9f24e', onLime: '#161a0e',
  blue: '#4f66f0', green: '#8fe388', red: '#f26d6d', amber: '#f2b23e',
};

const LIGHT: Palette = {
  bg: '#f2f3f5', card: '#ffffff', card2: '#eceef1', line: '#e2e4e8',
  text: '#16161a', muted: '#6b6b74', lime: '#c9f24e', onLime: '#161a0e',
  blue: '#4f66f0', green: '#2f9e5b', red: '#dd5049', amber: '#c07d10',
};

export function useColors(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? DARK : LIGHT;
}