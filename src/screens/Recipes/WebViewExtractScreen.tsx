import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, Linking } from 'react-native';
import { Appbar, Button, HelperText, Text } from 'react-native-paper';
import { WebView } from 'react-native-webview';

import { RecipesStackParamList } from '../../navigation/types';
import { submitParsePayload, getParseJobStatus } from '../../services/parseRecipe';
import { pollWithBackoff, saveActiveJob, clearActiveJob } from '../../services/jobPolling';
import { buildExtractionPayload } from '../../services/webviewExtraction';
import { mapParsedRecipeToParams, mapRecipeDraftToParsed } from './mappers';
import { trackImportCompleted, trackImportFailed, trackImportFallbackWebviewShown } from '../../services/telemetry';

type Props = NativeStackScreenProps<RecipesStackParamList, 'WebViewExtract'>;

const JS_EXTRACT = `
  (function() {
    const html = document.documentElement.outerHTML || '';
    window.ReactNativeWebView.postMessage(JSON.stringify({ html }));
  })();
`;

const WebViewExtractScreen = ({ navigation, route }: Props) => {
  const { url, domain } = route.params as { url: string; domain?: string };
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const webviewRef = useRef<WebView>(null);
  const [retryScheduled, setRetryScheduled] = useState(false);
  const navigatedRef = useRef(false);

  const handleNavigateBack = () => navigation.goBack();

  const handleExtraction = useCallback(
    async (html: string) => {
      setError(null);
      setSubmitting(true);
      try {
        const extraction = await buildExtractionPayload(html, { fallbackHtml: html });
        if (!extraction.jsonld.length && !extraction.htmlSnippet) {
          setError(
            'Unable to parse this page. This site does not expose recipe data in a readable format.',
          );
          return;
        }
        const payload = {
          input: {
            source_type: 'client_webview',
            source_url: url,
            jsonld_blocks: extraction.jsonld,
            html_snippet: extraction.htmlSnippet,
            extracted_at: new Date().toISOString(),
            client: 'mobile/1.0.0',
          },
        };
        const job = await submitParsePayload(payload);
        await saveActiveJob({
          jobId: job.id,
          jobType: 'webview',
          sourceUrl: url,
          startedAt: Date.now(),
        });
        const res = await pollWithBackoff(
          () => getParseJobStatus(job.id),
          (p) => p.status === 'COMPLETE' || p.status === 'ERROR',
          { timeoutMs: 90_000 },
        );
        if (res.status === 'COMPLETE' && !navigatedRef.current) {
          const recipeDraft = (res.result as any)?.recipe_draft || (res.result as any)?.recipe;
          if (recipe) {
            navigatedRef.current = true;
            trackImportCompleted('webview', domain, true);
            const parsed = mapRecipeDraftToParsed(recipeDraft);
            const params = mapParsedRecipeToParams(parsed, res.id);
            await clearActiveJob();
            navigation.replace('CreateRecipe', params as any);
            return;
          }
        }
        setError(
          res.result?.error_message ||
            res.error_message ||
            'Unable to extract this recipe from the page.',
        );
        trackImportFailed(
          'webview',
          domain,
          res.error_code,
          (res.result as any)?.next_action_reason,
        );
      } catch (err: any) {
        setError(
          err?.response?.data?.detail ||
            err?.message ||
            'Unable to extract this page. Please try again.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [domain, navigation, url],
  );

  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.html) {
        handleExtraction(data.html);
      }
    } catch {
      // ignore
    }
  };

  const triggerExtract = () => {
    webviewRef.current?.injectJavaScript(JS_EXTRACT);
  };

  trackImportFallbackWebviewShown(domain, 'blocked_by_site');

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={handleNavigateBack} />
        <Appbar.Content title="Import via Web" />
        <Appbar.Action icon="refresh" onPress={() => webviewRef.current?.reload()} />
      </Appbar.Header>
      <View style={styles.container}>
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          onLoadEnd={() => {
            setTimeout(() => triggerExtract(), 400);
            if (!retryScheduled) {
              setRetryScheduled(true);
              setTimeout(() => triggerExtract(), 900);
            }
          }}
          onMessage={onMessage}
        />
        {error ? (
          <HelperText type="error" visible style={styles.error}>
            {error}
          </HelperText>
        ) : null}
        <View style={styles.actions}>
          <Button mode="contained" onPress={triggerExtract} loading={submitting}>
            Import
          </Button>
          <Button onPress={handleNavigateBack}>Cancel</Button>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  actions: {
    padding: 12,
    gap: 8,
  },
  error: {
    marginHorizontal: 12,
  },
});

export default WebViewExtractScreen;

