/**
 * Stub for @expo/vector-icons and every subpath of it.
 *
 * The real package pulls expo-font -> expo-asset, which is not resolvable from
 * this tree's node_modules (Metro finds it through the Expo runtime; jest does
 * not). Two things import it: AppNavigator, for tab glyphs, and react-native-paper,
 * which probes `@expo/vector-icons/MaterialCommunityIcons` for every `icon=` prop
 * and logs a warning per icon when the probe fails.
 *
 * The Proxy covers named exports (MaterialCommunityIcons, Ionicons, ...) without
 * enumerating them. The icon renders its name as text, so a test can still assert
 * which glyph is on screen.
 */
const React = require('react');
const { Text } = require('react-native');

const Icon = ({ name, ...rest }) =>
  React.createElement(Text, { accessibilityRole: 'image', ...rest }, name ?? '');

Icon.loadFont = () => Promise.resolve();

module.exports = new Proxy(
  { __esModule: true, default: Icon },
  { get: (target, prop) => (prop in target ? target[prop] : Icon) },
);
