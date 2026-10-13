/**
 * Where this install's Jarvis lives.
 *
 * One address: jarvis-config-service. It knows every other service's
 * externally-reachable coordinates, so the app asks it rather than making
 * someone type each one — and moving a service to a new host stops being an app
 * problem.
 *
 * The per-service fields are still here, behind "Advanced", because a service
 * nobody has added on the admin Services page will not be discovered and needs
 * pinning by hand. They win over discovery when set.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  Divider,
  HelperText,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  CONFIG_DEFAULT_PORT,
  ServerSettings,
  ServerUrls,
  isValidUrl,
} from '../config/serverConfig';

type Props = {
  visible: boolean;
  settings: ServerSettings;
  resolved: ServerUrls;
  onDismiss: () => void;
  onSave: (configUrl: string, overrides: Partial<ServerUrls>) => Promise<void> | void;
  onReset?: () => Promise<void> | void;
};

const ServerUrlDialog = ({
  visible,
  settings,
  resolved,
  onDismiss,
  onSave,
  onReset,
}: Props) => {
  const theme = useTheme();
  const [configUrl, setConfigUrl] = useState(settings.configUrl);
  const [authOverride, setAuthOverride] = useState(settings.overrides.auth ?? '');
  const [recipesOverride, setRecipesOverride] = useState(settings.overrides.recipes ?? '');
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed each time it opens: the dialog stays mounted, so otherwise it shows
  // whatever was typed and abandoned last time.
  useEffect(() => {
    if (!visible) return;
    setConfigUrl(settings.configUrl);
    setAuthOverride(settings.overrides.auth ?? '');
    setRecipesOverride(settings.overrides.recipes ?? '');
    // Opened already expanded when an override is in play, so a pinned address
    // is not hidden from the person looking for why discovery is being ignored.
    setAdvanced(Boolean(settings.overrides.auth || settings.overrides.recipes));
  }, [visible, settings]);

  const configValid = !configUrl.trim() || isValidUrl(configUrl);
  const authValid = !authOverride.trim() || isValidUrl(authOverride);
  const recipesValid = !recipesOverride.trim() || isValidUrl(recipesOverride);
  const canSave = configValid && authValid && recipesValid;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(configUrl, { auth: authOverride, recipes: recipesOverride });
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
            The address of your Jarvis config service. Everything else is looked
            up from it.
          </Text>
          <TextInput
            mode="outlined"
            label="Jarvis address"
            value={configUrl}
            onChangeText={setConfigUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={`http://192.168.1.10:${CONFIG_DEFAULT_PORT}`}
            error={configUrl.length > 0 && !configValid}
          />

          {/* What it actually resolved to. Without this, a wrong address and a
              right one look identical until a request fails. */}
          <View style={styles.resolved}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Using
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              recipes · {resolved.recipes.replace(/^https?:\/\//i, '')}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              auth · {resolved.auth.replace(/^https?:\/\//i, '')}
            </Text>
          </View>

          <Button
            compact
            mode="text"
            onPress={() => setAdvanced((open) => !open)}
            icon={advanced ? 'chevron-up' : 'chevron-down'}
            style={styles.advancedToggle}
          >
            Advanced
          </Button>

          {advanced ? (
            <>
              <Divider style={styles.divider} />
              <Text
                variant="bodySmall"
                style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
              >
                Set these only for a service your config service does not list —
                they override what it says.
              </Text>
              <TextInput
                mode="outlined"
                label="Recipes server (optional)"
                value={recipesOverride}
                onChangeText={setRecipesOverride}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                dense
                error={recipesOverride.length > 0 && !recipesValid}
              />
              <TextInput
                mode="outlined"
                label="Auth server (optional)"
                value={authOverride}
                onChangeText={setAuthOverride}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                dense
                style={styles.second}
                error={authOverride.length > 0 && !authValid}
              />
            </>
          ) : null}

          {!canSave ? (
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
          <Button onPress={handleSave} loading={saving} disabled={saving || !canSave}>
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  hint: { marginBottom: 12 },
  resolved: { marginTop: 12, gap: 2 },
  advancedToggle: { alignSelf: 'flex-start', marginTop: 8 },
  divider: { marginBottom: 12 },
  second: { marginTop: 8 },
});

export default ServerUrlDialog;
