import 'dotenv/config';

export default {
  expo: {
    name: 'Jarvis Recipes',
    slug: 'jarvis-recipes-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/logo-dark.png',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/logo-dark.png',
      resizeMode: 'contain',
      backgroundColor: '#0f172a',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.anonymous.jarvisrecipesmobile',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/logo-dark.png',
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
      EXPO_PUBLIC_AUTH_API_BASE_URL: process.env.EXPO_PUBLIC_AUTH_API_BASE_URL,
      EXPO_PUBLIC_RECIPES_API_BASE_URL: process.env.EXPO_PUBLIC_RECIPES_API_BASE_URL,
    },
  },
};