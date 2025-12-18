import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, TextInput } from 'react-native-paper';
import { useMutation } from '@tanstack/react-query';

import { enqueueParseUrl } from '../../services/parseRecipe';
import { RecipesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RecipesStackParamList, 'AddRecipeFromUrl'>;

const urlRegex = /^https?:\/\/.+/i;

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
      const job = await mutateAsync(trimmed);
      if (!job?.id) {
        setError('Unable to start import. Please try again.');
        return;
      }
      navigation.replace('ImportJobStatus', {
        jobId: job.id,
        sourceUrl: trimmed,
        jobType: 'url',
        startedAt: Date.now(),
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const isFetchFailed =
        detail?.error_code === 'fetch_failed' &&
        detail?.status_code === 403 &&
        detail?.message?.toLowerCase?.().includes('status 403');

      if (isFetchFailed) {
        let domain: string | undefined;
        try {
          domain = new URL(trimmed).hostname;
        } catch {
          domain = undefined;
        }
        navigation.replace('WebViewExtract', { url: trimmed, domain });
        return;
      }

      const raw =
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

