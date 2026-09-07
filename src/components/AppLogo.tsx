import React from 'react';
import { Image, ImageStyle, StyleSheet, View } from 'react-native';

/**
 * The app mark.
 *
 * One asset for both themes: the mark is a shield with its own dark ground and a
 * light figure inside, so it reads on the light and dark backgrounds alike and
 * does not need a per-theme variant the way a bare wordmark would.
 *
 * SQUARE. The previous logo was 3:2 and this component hard-coded that ratio
 * (`height: size * 2 / 3`), which letterboxes a square mark and leaves a third of
 * the box empty. `size` is now the side length.
 */
const logoMark = require('../../assets/logo-mark.png');

type Props = {
  size?: number;
  style?: ImageStyle;
  /**
   * Kept so existing callers still type-check. The mark carries its own
   * background, so there is no longer a light/dark pair to choose between.
   */
  forceLight?: boolean;
};

const AppLogo: React.FC<Props> = ({ size = 120, style }) => (
  <View style={styles.container}>
    <Image
      source={logoMark}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Jarvis Recipes"
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppLogo;
