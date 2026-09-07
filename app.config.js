import 'dotenv/config';

export default {
  expo: {
    name: 'Jarvis Recipes',
    slug: 'jarvis-recipes-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/logo-mark.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    // expo-secure-store backs the JWT keychain storage (services/tokenStorage).
    // No faceIDPermission: this app never gates an item behind biometrics.
    plugins: ['expo-secure-store'],
    splash: {
      image: './assets/logo-mark.png',
      resizeMode: 'contain',
      backgroundColor: '#0f172a',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.jarvisautomation.jarvisrecipesmobile',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/logo-mark.png',
        backgroundColor: '#0f172a',
      },
      package: 'com.anonymous.jarvisrecipesmobile',
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      eas: {
        projectId: 'bdbd0be7-f229-46ba-93b0-7205af508053',
      },
      EXPO_PUBLIC_AUTH_API_BASE_URL: process.env.EXPO_PUBLIC_AUTH_API_BASE_URL,
      EXPO_PUBLIC_RECIPES_API_BASE_URL: process.env.EXPO_PUBLIC_RECIPES_API_BASE_URL,
    },
  },
};