import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { AuthStackParamList } from '../../navigation/types';
import AppLogo from '../../components/AppLogo';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

const LandingScreen = ({ navigation }: Props) => {
  const logoSize = Math.round(Dimensions.get('window').width * 1.0);

  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <AppLogo forceLight size={logoSize} />
      </View>
      <Text variant="headlineMedium" style={styles.title}>
        Jarvis Recipes
      </Text>
      <Text variant="bodyLarge" style={styles.subtitle}>
        Family recipes, meal planning, and shopping in one place.
      </Text>

      <View style={styles.actions}>
        <Button mode="contained" onPress={() => navigation.navigate('Login')}>
          Log In
        </Button>
        <Button mode="outlined" onPress={() => navigation.navigate('Register')}>
          Create Account
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  logoRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: '#475569',
  },
  actions: {
    gap: 12,
  },
});

export default LandingScreen;

