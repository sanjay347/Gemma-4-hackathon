import React, { createContext, useContext, useState } from 'react';
import { LayoutAnimation, UIManager, Platform } from 'react-native';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export type Theme = 'dark' | 'light';

export const Colors = {
  dark: {
    background: '#06080F',
    card: '#0E1117',
    border: '#1C2333',
    text: '#FFFFFF',
    textSecondary: '#6B7280',
    primary: '#3B82F6',
    danger: '#EF4444',
    tabBar: '#0E1117',
    cardShadow: 'transparent',
    cardAlt: '#131924',
  },
  light: {
    background: '#F2F5FF',
    card: '#FFFFFF',
    border: '#E4E8F7',
    text: '#0F172A',
    textSecondary: '#5B6A8A',
    primary: '#2563EB',
    danger: '#DC2626',
    tabBar: '#FFFFFF',
    cardShadow: '#1E3A8A14',
    cardAlt: '#F6F8FF',
  },
};

export type AppColors = typeof Colors.dark & typeof Colors.light;

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  colors: AppColors;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  colors: Colors.light,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<Theme>('light');

  const toggleTheme = () => {
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const colors = Colors[theme];

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
