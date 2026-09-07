import 'react-native-gesture-handler/jestSetup';

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock expo-secure-store (OS keychain) — where the JWT access/refresh pair
// lives. The keychainAccessible constants are referenced by tokenStorage's
// option objects, so they have to exist on the mock. Tests that need a
// populated keychain override getItemAsync with mockImplementation.
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED: 'whenUnlocked',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
}));

// react-native-webview reaches for a native TurboModule at import time, so any
// test that mounts RecipesNavigator (WebViewExtractScreen imports it) dies before
// rendering. A stub that records its props is enough — nothing in a test can
// execute page JS anyway.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props, ref) =>
    React.createElement(View, { ...props, ref, testID: props.testID ?? 'webview' }),
  );
  return { __esModule: true, WebView, default: WebView };
});

// react-test-renderer reports an uncaught render error via window.dispatchEvent.
// jest-expo's environment has a `window` without it, so React's error REPORTING
// throws and replaces the real stack with "window.dispatchEvent is not a
// function" -- which is how a genuine crash arrives disguised as an environment
// bug. Give it a no-op so the actual error surfaces.
if (typeof global.window !== 'undefined' && typeof global.window.dispatchEvent !== 'function') {
  global.window.dispatchEvent = () => true;
}
