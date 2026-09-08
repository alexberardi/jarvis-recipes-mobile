/**
 * Where this install's Jarvis lives.
 *
 * Modelled on jarvis-node-mobile's server switcher, minus the network scan: a
 * self-hosted app cannot ship its endpoints, but discovering them costs an iOS
 * local-network prompt before the person has decided to trust the app, and fails
 * silently on any network that isolates clients.
 */
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import {
  AUTH_DEFAULT_PORT,
  RECIPES_DEFAULT_PORT,
  ServerUrls,
  deriveCompanionUrl,
  isValidUrl,
  normalizeUrl,
} from '../config/serverConfig';

type Props = {
  visible: boolean;
  urls: ServerUrls;
  onDismiss: () => void;
  onSave: (urls: ServerUrls) => Promise<void> | void;
  onReset?: () => Promise<void> | void;
};

const ServerUrlDialog = ({ visible, urls, onDismiss, onSave, onReset }: Props) => {
  const theme = useTheme();
  const [recipes, setRecipes] = useState(urls.recipes);
  const [auth, setAuth] = useState(urls.auth);
  const [touchedAuth, setTouchedAuth] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed each time it opens: the dialog stays mounted, so without this it
  // would show whatever was typed and abandoned last time.
  useEffect(() => {
    if (visible) {
      setRecipes(urls.recipes);
      setAuth(urls.auth);
      setTouchedAuth(false);
    }
  }, [visible, urls.auth, urls.recipes]);

  /**
   * Fill in the auth address from the recipes one, until it is edited by hand.
   *
   * Both services on one host at their documented ports is the overwhelmingly
   * common install. It is a guess, so it is shown in the field rather than
   * applied invisibly, and anything reverse-proxied can be corrected before
   * saving.
   */
  const handleRecipesChange = (value: string) => {
    setRecipes(value);
    if (touchedAuth) return;
    const derived = deriveCompanionUrl(value, AUTH_DEFAULT_PORT);
    if (derived) setAuth(derived);
  };

  const recipesValid = isValidUrl(recipes);
  const authValid = isValidUrl(auth);

  const handleSave = async () => {
    if (!recipesValid || !authValid) return;
    setSaving(true);
    try {
      await onSave({ auth: normalizeUrl(auth), recipes: normalizeUrl(recipes) });
      onDismiss();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Server address</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
            Where your Jarvis is running. On a standard install both services are
            on the same machine, so filling in the first fills in the second.
          </Text>
          <TextInput
            mode="outlined"
            label="Recipes server"
            value={recipes}
            onChangeText={handleRecipesChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={`http://192.168.1.10:${RECIPES_DEFAULT_PORT}`}
            error={recipes.length > 0 && !recipesValid}
          />
          <TextInput
            mode="outlined"
            label="Auth server"
            value={auth}
            onChangeText={(value) => {
              setTouchedAuth(true);
              setAuth(value);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={`http://192.168.1.10:${AUTH_DEFAULT_PORT}`}
            error={auth.length > 0 && !authValid}
            style={styles.second}
          />
          {(recipes.length > 0 && !recipesValid) || (auth.length > 0 && !authValid) ? (
            <HelperText type="error" visible>
              That does not look like an address. A host and port is enough —
              http:// is added for you.
            </HelperText>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          {onReset ? (
            <Button onPress={onReset} textColor={theme.colors.error}>
              Reset
            </Button>
          ) : null}
          <Button onPress={onDismiss}>Cancel</Button>
          <Button
            onPress={handleSave}
            loading={saving}
            disabled={saving || !recipesValid || !authValid}
          >
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  hint: { marginBottom: 12 },
  second: { marginTop: 8 },
});

export default ServerUrlDialog;
