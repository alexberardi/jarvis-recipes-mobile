import React from 'react';
import { Image, ImageStyle, StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';

const logoLight = require('../../assets/logo-light.png');
const logoDark = require('../../assets/logo-dark.png');

type Props = {
  size?: number;
  style?: ImageStyle;
  forceLight?: boolean;
};

const AppLogo: React.FC<Props> = ({ size = 120, style, forceLight = false }) => {
  const theme = useTheme();
  const source = forceLight ? logoLight : theme.dark ? logoDark : logoLight;
  return (
    <View style={styles.container}>
      <Image source={source} style={[{ width: size, height: (size * 2) / 3 }, style]} resizeMode="contain" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AppLogo;

