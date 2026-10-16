import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, Platform, Text, View, useColorScheme } from 'react-native';
import { useEffect, useState } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

import { initDatabase } from '../db/db';
import { prepareDatabase } from '../db/sqlite';
import { seedDemoIfEmpty } from '../db/demo';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The database must be ready before any screen reads from it.
  useEffect(() => {
    let cancelled = false;
    prepareDatabase()
      .then(() => {
        initDatabase();
        if (Platform.OS === 'web') seedDemoIfEmpty(); // portfolio web demo only
        if (!cancelled) setReady(true);
      })
      .catch((e) => {
        SplashScreen.hideAsync().catch(() => {});
        if (!cancelled) setError(String(e?.message ?? e));
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#dd5049', fontWeight: '700', marginBottom: 6 }}>Could not start the app</Text>
        <Text style={{ color: '#6b6b74', textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colorScheme === 'dark' ? '#141416' : '#f2f3f5' }}>
        <ActivityIndicator color="#4d7c0f" size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}
