import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, TextInput } from 'react-native-paper';
import { useMutation } from '@tanstack/react-query';

import { enqueueParseUrl } from '../../services/parseRecipe';
import { trackImportFallbackWebviewShown } from '../../services/telemetry';
import { RecipesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RecipesStackParamList, 'AddRecipeFromUrl'>;

const urlRegex = /^https?:\/\/.+/i;

const hostnameOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname;
  } catch (error) {
    console.warn(
      '[AddRecipeFromUrl] Failed to parse URL hostname:',
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
};

const AddRecipeFromUrlScreen = ({ navigation, route }: Props) => {
  const [url, setUrl] = useState(route.params?.initialUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: enqueueParseUrl,
  });

  const handleImport = async () => {
    setError(null);
    const trimmed = url.trim();
    if (!urlRegex.test(trimmed)) {
      setError('Enter a valid URL (https://...)');
      return;
    }

    try {
      const response = await mutateAsync(trimmed);
      
      // Per PRD: parse-url/async now always returns next_action="webview_extract"
      // We should NOT poll this job, but proceed directly to webview extraction
      if (response?.next_action === 'webview_extract') {
        navigation.replace('WebViewExtract', { url: trimmed, domain: hostnameOf(trimmed) });
        return;
      }

      // Fallback: if somehow next_action is not present, show error
      // This shouldn't happen per the new API contract, but handle gracefully
      setError('Unable to start import. Please try again.');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;

      // A site that blocks automated fetches (401/403 on the server's preflight)
      // comes back as HTTP 400, so it lands here rather than on the success path
      // above — but its detail still carries the webview handoff. Honour it
      // before the fetch_failed branch, which would otherwise dead-end the
      // import on "Site returned status 403." Mirrors ImportJobStatusScreen,
      // which handles the same signal on the polling path.
      if (detail?.next_action === 'webview_extract') {
        const domain = hostnameOf(trimmed);
        setError('This site blocks automated import.');
        trackImportFallbackWebviewShown(domain, detail?.next_action_reason);
        Alert.alert(
          'This site blocks automated import',
          'Open the recipe in the in-app browser so we can import it.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
              onPress: () => {
                navigation.replace('WebViewExtract', { url: trimmed, domain });
              },
            },
          ],
        );
        return;
      }

      // Handle URL validation errors (per PRD)
      if (detail?.error_code === 'invalid_url' || detail?.error_code === 'fetch_failed' || detail?.error_code === 'unsupported_content_type') {
        const message = detail?.message || detail?.error_code || 'Invalid URL or site is unreachable.';
        setError(message);
        return;
      }

      // For other errors, show the error message
      const raw =
        detail?.message ||
        detail ||
        err?.response?.data?.detail ||
        err?.message ||
        err?.response?.data ||
        'Unable to start import. Please try again.';
      const message = typeof raw === 'string' ? raw : JSON.stringify(raw);
      setError(message);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Add from URL" />
      </Appbar.Header>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={80}
      >
        <View style={styles.container}>
          <TextInput
            label="Recipe URL"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            testID="recipe-url-input"
            nativeID="recipe-url-input"
            accessibilityLabel="Recipe URL Input"
            accessible
            placeholder="https://example.com/recipe"
          />
          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}
          <Button
            mode="contained"
            onPress={handleImport}
            disabled={isPending}
            loading={isPending}
            testID="import-recipe-button"
          >
            Import recipe
          </Button>
        </View>
      </KeyboardAvoidingView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
});

export default AddRecipeFromUrlScreen;

