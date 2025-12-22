import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { Appbar, Button, HelperText, Text } from 'react-native-paper';
import { WebView } from 'react-native-webview';

import { RecipesStackParamList } from '../../navigation/types';
import { submitParsePayload, getParseJobStatus } from '../../services/parseRecipe';
import { pollWithBackoff, saveActiveJob, clearActiveJob } from '../../services/jobPolling';
import { mapParsedRecipeToParams, mapRecipeDraftToParsed } from './mappers';
import { trackImportCompleted, trackImportFailed, trackImportFallbackWebviewShown } from '../../services/telemetry';

type Props = NativeStackScreenProps<RecipesStackParamList, 'WebViewExtract'>;

// Per PRD: Extract all JSON-LD blocks and HTML snippet
// Improved extraction to handle edge cases: case-insensitive, whitespace, dynamic scripts
const JS_EXTRACT = `
  (function() {
    // Extract all JSON-LD blocks (some pages have multiple)
    // Use more robust extraction that handles:
    // - Case variations (application/ld+json, application/ld+JSON, etc.)
    // - Whitespace in type attribute
    // - Both single and double quotes
    // - Dynamically added scripts
    const allScripts = document.querySelectorAll('script');
    const jsonldBlocks = [];
    const seen = new Set(); // Track seen content to avoid duplicates
    
    // Method 1: Iterate through all script tags and check type attribute
    for (let i = 0; i < allScripts.length; i++) {
      const script = allScripts[i];
      const type = script.getAttribute('type');
      
      // Case-insensitive check for JSON-LD type (handles whitespace)
      if (type && /application\\/ld\\+json/i.test(type.trim())) {
        const content = (script.textContent || script.innerHTML || '').trim();
        if (content && content.length > 0 && !seen.has(content)) {
          jsonldBlocks.push(content);
          seen.add(content);
        }
      }
    }
    
    // Method 2: Regex-based extraction as additional safety net
    // This catches edge cases like malformed attributes, comments, etc.
    // Matches the server-side regex pattern for consistency
    try {
      const html = document.documentElement.outerHTML || document.body?.outerHTML || '';
      // Use RegExp constructor to avoid template string escaping issues
      const pattern = '<script[^>]*type=["\\']application/ld\\+json["\\'][^>]*>([\\s\\S]*?)</script>';
      const regex = new RegExp(pattern, 'gi');
      let match;
      while ((match = regex.exec(html)) !== null) {
        if (match[1]) {
          const content = match[1].trim();
          // Only add if not already captured
          if (content && content.length > 0 && !seen.has(content)) {
            jsonldBlocks.push(content);
            seen.add(content);
          }
        }
      }
    } catch (e) {
      // If regex fails, continue with what we have from Method 1
    }
    
    // Extract main content HTML (for LLM fallback)
    const article = document.querySelector('article[itemtype*="Recipe"]') ||
                    document.querySelector('article[itemtype*="recipe"]') ||
                    document.querySelector('article') ||
                    document.querySelector('main') ||
                    document.body;
    const htmlSnippet = article ? article.innerHTML.substring(0, 50000) : null;
    
    // Send back to React Native
    window.ReactNativeWebView.postMessage(JSON.stringify({
      jsonld: jsonldBlocks,
      html: htmlSnippet
    }));
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
    async (jsonldBlocks: string[], htmlSnippet: string | null) => {
      setError(null);
      setSubmitting(true);
      try {
        // Per PRD: Validate that we have some content to submit
        if (!jsonldBlocks.length && !htmlSnippet) {
          setError(
            'Unable to parse this page. This site does not expose recipe data in a readable format.',
          );
          return;
        }

        // Per PRD: Build payload matching the expected format
        const payload = {
          input: {
            source_type: 'client_webview',
            source_url: url,
            jsonld_blocks: jsonldBlocks, // Array of raw JSON-LD strings
            html_snippet: htmlSnippet || undefined, // Optional HTML snippet
            extracted_at: new Date().toISOString(),
            client: Platform.OS === 'ios' ? `ios:1.0.0` : `android:1.0.0`,
          },
        };

        const job = await submitParsePayload(payload);
        await saveActiveJob({
          jobId: job.id,
          jobType: 'webview',
          sourceUrl: url,
          startedAt: Date.now(),
        });

        // Poll for job completion using /recipes/jobs/{job_id}
        const res = await pollWithBackoff(
          () => getParseJobStatus(job.id),
          (p) => p.status === 'COMPLETE' || p.status === 'ERROR',
          { timeoutMs: 90_000 },
        );

        if (res.status === 'COMPLETE' && !navigatedRef.current) {
          const recipeDraft = (res.result as any)?.recipe_draft || (res.result as any)?.recipe;
          if (recipeDraft) {
            navigatedRef.current = true;
            trackImportCompleted('webview', domain, true);
            const parsed = mapRecipeDraftToParsed(recipeDraft);
            const params = mapParsedRecipeToParams(parsed, res.id, (res.result as any)?.warnings);
            await clearActiveJob();
            navigation.replace('CreateRecipe', params as any);
            return;
          }
        }

        // Handle error status
        if (res.status === 'ERROR') {
          setError(
            (res.result as any)?.error_message ||
              res.error_message ||
              'Unable to extract this recipe from the page.',
          );
          trackImportFailed(
            'webview',
            domain,
            res.error_code || undefined,
            (res.result as any)?.next_action_reason,
          );
        } else {
          setError('Unable to extract this recipe from the page.');
        }
      } catch (err: any) {
        const errorDetail = err?.response?.data?.detail;
        const errorMessage = 
          (typeof errorDetail === 'string' ? errorDetail : errorDetail?.message) ||
          err?.message ||
          'Unable to extract this page. Please try again.';
        setError(errorMessage);
        trackImportFailed('webview', domain, errorDetail?.error_code, undefined);
      } finally {
        setSubmitting(false);
      }
    },
    [domain, navigation, url],
  );

  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      // Per PRD: Extract both JSON-LD blocks and HTML snippet
      if (data?.jsonld || data?.html) {
        const jsonldBlocks = Array.isArray(data.jsonld) ? data.jsonld : [];
        const htmlSnippet = data.html || null;
        handleExtraction(jsonldBlocks, htmlSnippet);
      }
    } catch {
      // ignore invalid messages
    }
  };

  const triggerExtract = () => {
    webviewRef.current?.injectJavaScript(JS_EXTRACT);
  };

  // Per PRD: Webview is now always required for URL parsing
  trackImportFallbackWebviewShown(domain, 'webview_required');

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

