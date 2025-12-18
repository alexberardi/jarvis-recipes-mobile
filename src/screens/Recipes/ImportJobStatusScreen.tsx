import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, Text } from 'react-native-paper';

import LoadingIndicator from '../../components/LoadingIndicator';
import { RecipesStackParamList } from '../../navigation/types';
import { getParseJobStatus } from '../../services/parseRecipe';
import { clearActiveJob, saveActiveJob, pollWithBackoff } from '../../services/jobPolling';
import { mapParsedRecipeToParams, mapRecipeDraftToParsed } from './mappers';
import {
  trackImportCompleted,
  trackImportFailed,
  trackImportFallbackWebviewShown,
  trackImportStarted,
} from '../../services/telemetry';

type Props = NativeStackScreenProps<RecipesStackParamList, 'ImportJobStatus'>;

const ImportJobStatusScreen = ({ navigation, route }: Props) => {
  const { jobId, sourceUrl, jobType, startedAt } = route.params ?? {};
  const [status, setStatus] = useState<string>('PENDING');
  const [message, setMessage] = useState<string>('Import in progress…');
  const [error, setError] = useState<string | null>(null);
  const [handling, setHandling] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const navigatedRef = useRef(false);
  const domain = sourceUrl ? (() => {
    try {
      return new URL(sourceUrl).hostname;
    } catch {
      return undefined;
    }
  })() : undefined;

  useEffect(() => {
    if (!jobType) {
      setError('Missing job information.');
      return;
    }
    if (!jobId) {
      if (jobType === 'webview' && sourceUrl) {
        navigation.replace('WebViewExtract', { url: sourceUrl, domain });
      } else {
        setError('Missing job information.');
      }
      return;
    }
    trackImportStarted(jobType, domain);
    if (jobId) {
      saveActiveJob({
        jobId,
        jobType,
        sourceUrl,
        startedAt: startedAt ?? Date.now(),
      });
    }

    const aborter = new AbortController();
    abortRef.current = aborter;

    const run = async () => {
      try {
        const res = await pollWithBackoff(
          () => getParseJobStatus(jobId),
          (p) => p.status === 'COMPLETE' || p.status === 'ERROR',
          { signal: aborter.signal, timeoutMs: 90_000 },
        );
        setStatus(res.status);
        if (res.status === 'COMPLETE') {
          const result: any = res.result;
          const recipeDraft = result?.recipe_draft || result?.recipe;
          const effectiveJobId = jobId ?? res.id ?? 'job';
          if (recipeDraft && !navigatedRef.current) {
            navigatedRef.current = true;
            trackImportCompleted(
              jobType,
              domain,
              jobType === 'webview',
              Date.now() - (startedAt ?? Date.now()),
            );
            const parsed = mapRecipeDraftToParsed(recipeDraft);
            const params = mapParsedRecipeToParams(parsed, effectiveJobId, result?.warnings);
            await clearActiveJob();
            navigation.replace('CreateRecipe', params as any);
            return;
          }
          if (result?.success && !navigatedRef.current) {
            navigatedRef.current = true;
            trackImportCompleted(
              jobType,
              domain,
              jobType === 'webview',
              Date.now() - (startedAt ?? Date.now()),
            );
            await clearActiveJob();
            navigation.replace('CreateRecipe', { parseJobId: effectiveJobId } as any);
            return;
          }
        }

        if (
          res.status === 'ERROR' &&
          res.error_code === 'fetch_failed' &&
          (res.result as any)?.next_action === 'webview_extract' &&
          (res.result as any)?.next_action_reason === 'blocked_by_site' &&
          sourceUrl
        ) {
          setError('This site blocks automated import.');
          trackImportFallbackWebviewShown(domain, (res.result as any)?.next_action_reason);
          Alert.alert(
            'This site blocks automated import',
            'Open the recipe in the in-app browser so we can import it.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Continue',
                onPress: () => {
                  navigation.replace('WebViewExtract', { url: sourceUrl, domain });
                },
              },
            ],
          );
          return;
        }

        setError(
          (res.result as any)?.error_message ||
            res.error_message ||
            'Unable to import this recipe right now.',
        );
        trackImportFailed(
          jobType,
          domain,
          res.error_code ?? undefined,
          (res.result as any)?.next_action_reason,
        );
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Unable to check import status.');
      }
    };

    run();

    return () => {
      abortRef.current?.abort();
    };
  }, [domain, jobId, jobType, navigation, sourceUrl, startedAt]);

  const handleRetry = () => {
    if (!jobId || !jobType) return;
    navigation.replace('ImportJobStatus', { jobId, jobType, sourceUrl, startedAt: Date.now() });
  };

  const handleCancel = async () => {
    if (handling) return;
    setHandling(true);
    await clearActiveJob();
    navigation.goBack();
  };

  const isLoading = status === 'PENDING' || status === 'RUNNING';

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={handleCancel} />
        <Appbar.Content title="Importing recipe" />
      </Appbar.Header>
      <View style={styles.container}>
        {isLoading ? (
          <>
            <LoadingIndicator />
            <Text style={styles.center}>{message}</Text>
            <Button onPress={handleCancel}>Cancel</Button>
          </>
        ) : error ? (
          <>
            <HelperText type="error" visible>
              {error}
            </HelperText>
            <Button mode="contained" onPress={handleRetry}>
              Retry
            </Button>
            <Button onPress={handleCancel}>Cancel</Button>
          </>
        ) : null}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});

export default ImportJobStatusScreen;

