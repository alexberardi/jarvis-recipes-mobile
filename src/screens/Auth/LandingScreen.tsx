import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

import { AuthStackParamList } from '../../navigation/types';
import AppLogo from '../../components/AppLogo';
import ServerUrlDialog from '../../components/ServerUrlDialog';
import {
  ServerSettings,
  ServerUrls,
  getServerSettings,
  getServerUrls,
  resetServerUrls,
  setConfigUrl,
  setOverride,
} from '../../config/serverConfig';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

const LandingScreen = ({ navigation }: Props) => {
  const theme = useTheme();
  // The mark is square now, so full width would be a full-width-TALL block
  // and push the buttons off screen. 55% leaves room for the title, the
  // strapline and both actions without scrolling.
  const logoSize = Math.round(Dimensions.get('window').width * 0.55);

  const [urls, setUrls] = useState<ServerUrls>(getServerUrls());
  const [settings, setSettings] = useState<ServerSettings>(getServerSettings());
  const [dialogVisible, setDialogVisible] = useState(false);

  // Host and port only. The full URL is long, wraps, and the scheme is noise on
  // a line whose job is to answer "which server am I about to log in to?".
  const shortAddress = urls.recipes.replace(/^https?:\/\//i, '');

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

    {/* Before signing in, not buried in settings. Jarvis is self-hosted, so
        "which server?" is a question the FIRST screen has to answer -- and an
        account only exists on one of them. */}
    <Button
      mode="text"
      compact
      icon="pencil-outline"
      onPress={() => setDialogVisible(true)}
      accessibilityLabel={`Server address: ${shortAddress}. Tap to change.`}
      labelStyle={[styles.serverLabel, { color: theme.colors.onSurfaceVariant }]}
      style={styles.server}
    >
      {shortAddress}
    </Button>

    <ServerUrlDialog
      visible={dialogVisible}
      settings={settings}
      resolved={urls}
      onDismiss={() => setDialogVisible(false)}
      onSave={async (configUrl, overrides) => {
        // Overrides first: setConfigUrl triggers discovery, and an override that
        // lands after it would not be reflected in what we then read back.
        await setOverride('auth', overrides.auth ?? null);
        await setOverride('recipes', overrides.recipes ?? null);
        await setConfigUrl(configUrl);
        setSettings(getServerSettings());
        setUrls(getServerUrls());
      }}
      onReset={async () => {
        setUrls(await resetServerUrls());
        setSettings(getServerSettings());
        setDialogVisible(false);
      }}
    />
  </View>
);
};

const styles = StyleSheet.create({
  server: {
    marginTop: 24,
    alignSelf: 'center',
  },
  serverLabel: {
    fontSize: 12,
  },
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

