import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from './src/auth/AuthContext';
import { AUTH_API_BASE_URL, RECIPES_API_BASE_URL } from './src/config/env';
import RootNavigator from './src/navigation/RootNavigator';
import { ThemeProvider, useThemePreference } from './src/theme/ThemeProvider';

const queryClient = new QueryClient();
SplashScreen.preventAutoHideAsync().catch(() => {});

if (__DEV__) {
  // Surface env wiring in dev
  // eslint-disable-next-line no-console
  console.log('Auth API:', AUTH_API_BASE_URL, 'Recipes API:', RECIPES_API_BASE_URL);
}

const AppContent = () => {
  const { paperTheme, navTheme, isDark } = useThemePreference();
  useEffect(() => {
    // Hide native splash once React tree mounts; we render our own theme-aware UI.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <PaperProvider theme={paperTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NavigationContainer theme={navTheme}>
            <RootNavigator />
            <StatusBar style={isDark ? 'light' : 'dark'} />
          </NavigationContainer>
        </AuthProvider>
      </QueryClientProvider>
    </PaperProvider>
  );
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

