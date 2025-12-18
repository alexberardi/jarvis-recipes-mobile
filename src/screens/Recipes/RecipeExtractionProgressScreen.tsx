import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, ProgressBar, Text } from 'react-native-paper';

import LoadingIndicator from '../../components/LoadingIndicator';
import { RecipesStackParamList } from '../../navigation/types';
import {
  LocalImage,
  submitImageIngestionJob,
  waitForIngestionMessage,
} from '../../services/recipeIngestion';
import { ParsedRecipe } from '../../types/Recipe';
import { saveActiveJob, clearActiveJob } from '../../services/jobPolling';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeExtractionProgress'>;

type Phase = 'upload' | 'processing' | 'error';

const mapParsedRecipeToParams = (recipe: ParsedRecipe, ingestionId: string) => {
  return {
    initialRecipe: {
      title: recipe.title ?? '',
      description: recipe.description ?? '',
      sourceUrl: recipe.source_url ?? '',
      tags: recipe.tags ?? [],
      servings: recipe.servings ?? null,
      prepMinutes: recipe.estimated_time_minutes ?? null,
      cookMinutes: null,
      imageUrl: recipe.image_url ?? '',
      ingredients:
        recipe.ingredients?.map((ing, idx) => ({
          id: `${ingestionId}-${idx}`,
          text: ing.text,
          quantityDisplay: ing.quantity_display ?? null,
          unit: ing.unit ?? null,
        })) ?? [],
      steps: recipe.steps ?? [],
      notes: recipe.notes ?? [],
    },
    parseWarnings: [],
    parseJobId: undefined,
    parsedUrl: recipe.source_url ?? '',
  };
};

type ImageRecipeDraft = {
  title?: string | null;
  description?: string | null;
  ingredients?: {
    name?: string | null;
    quantity?: string | number | null;
    unit?: string | null;
    notes?: string | null;
  }[];
  steps?: string[];
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  total_time_minutes?: number | null;
  servings?: number | null;
  tags?: string[];
};

const mapImageDraftToParams = (
  draft: ImageRecipeDraft,
  jobId: string,
  warnings?: string[],
) => {
  const ingredients =
    draft.ingredients?.map((ing, idx) => ({
      id: `${jobId}-${idx}`,
      text: ing.name ? `${ing.name}${ing.notes ? ` — ${ing.notes}` : ''}` : '',
      quantityDisplay:
        ing.quantity != null && ing.quantity !== ''
          ? typeof ing.quantity === 'number'
            ? String(ing.quantity)
            : ing.quantity
          : null,
      unit: ing.unit ?? null,
    })) ?? [];

  const steps = draft.steps ?? [];

  const totalMinutes =
    typeof draft.total_time_minutes === 'number' ? draft.total_time_minutes : null;
  const prepMinutes =
    typeof draft.prep_time_minutes === 'number' ? draft.prep_time_minutes : null;
  const cookMinutes =
    typeof draft.cook_time_minutes === 'number' ? draft.cook_time_minutes : null;

  return {
    initialRecipe: {
      title: draft.title ?? '',
      description: draft.description ?? '',
      sourceUrl: null,
      tags: draft.tags ?? [],
      servings: draft.servings ?? null,
      prepMinutes,
      cookMinutes,
      imageUrl: '',
      ingredients,
      steps,
      notes: [],
    },
    parseWarnings: warnings ?? [],
    parseJobId: jobId,
    parsedUrl: null,
    totalMinutes,
  };
};

const RecipeExtractionProgressScreen = ({ navigation, route }: Props) => {
  const { images, titleHint } = route.params as { images: LocalImage[]; titleHint?: string };
  const [phase, setPhase] = useState<Phase>('upload');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Uploading images…');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navigatedRef = useRef(false);

  const startFlow = async () => {
    setError(null);
    setPhase('upload');
    setProgress(0);
    const aborter = new AbortController();
    abortRef.current = aborter;

    try {
      const { jobId, ingestionId } = await submitImageIngestionJob(images, {
        titleHint,
        signal: aborter.signal,
        onUploadProgress: (pct) => setProgress(pct / 100),
      });
      await saveActiveJob({
        jobId,
        jobType: 'image',
        sourceUrl: undefined,
        startedAt: Date.now(),
      });
      const ingestionIdentifier = ingestionId ?? jobId;
      setPhase('processing');
      setMessage('Processing images… this may take a few minutes.');
      const mailboxMsg = await waitForIngestionMessage(jobId, { signal: aborter.signal });

      if (mailboxMsg.type === 'recipe_image_ingestion_completed' && !navigatedRef.current) {
        navigatedRef.current = true;
        const params = mapParsedRecipeToParams(mailboxMsg.recipe_draft, ingestionIdentifier);
        await clearActiveJob();
        navigation.replace('CreateRecipe', params as any);
        return;
      }

      if (mailboxMsg.result?.recipe_draft && !navigatedRef.current) {
        navigatedRef.current = true;
        const pipelineWarnings =
          mailboxMsg.result?.pipeline?.attempts
            ?.flatMap((a: any) => a?.warnings ?? [])
            .filter(Boolean) ?? [];
        const params = mapImageDraftToParams(
          mailboxMsg.result.recipe_draft,
          jobId,
          pipelineWarnings,
        );
        await clearActiveJob();
        navigation.replace('CreateRecipe', params as any);
        return;
      }

      if (!navigatedRef.current && mailboxMsg.status === 'COMPLETE' && mailboxMsg.result?.success === true) {
        navigatedRef.current = true;
        await clearActiveJob();
        navigation.replace('CreateRecipe', { parseJobId: jobId } as any);
        return;
      }

      setPhase('error');
      setError(
        mailboxMsg.message ||
          mailboxMsg.error_message ||
          mailboxMsg?.result?.error_message ||
          'We could not extract a recipe from these images. Try clearer photos and retry.',
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setPhase('error');
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Unable to upload images right now. Please try again.',
      );
    }
  };

  useEffect(() => {
    startFlow();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = () => {
    abortRef.current?.abort();
    navigation.goBack();
  };

  const handleRetry = () => {
    abortRef.current?.abort();
    startFlow();
  };

  const isUploading = phase === 'upload';
  const isProcessing = phase === 'processing';

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={handleCancel} />
        <Appbar.Content title="Extracting recipe" />
      </Appbar.Header>
      <View style={styles.container}>
        {isUploading ? (
          <>
            <Text variant="titleMedium">{message}</Text>
            <ProgressBar progress={progress} style={styles.progress} />
            <Text>{Math.round(progress * 100)}%</Text>
            <Button onPress={handleCancel}>Cancel</Button>
          </>
        ) : isProcessing ? (
          <>
            <LoadingIndicator />
            <Text style={styles.center}>{message}</Text>
            <Button onPress={handleCancel}>Cancel</Button>
          </>
        ) : (
          <>
            <HelperText type="error" visible>
              {error ?? 'Something went wrong while extracting your recipe.'}
            </HelperText>
            <Button mode="contained" onPress={handleRetry}>
              Retry
            </Button>
            <Button onPress={handleCancel}>Back to images</Button>
          </>
        )}
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
  progress: {
    height: 10,
    borderRadius: 8,
  },
  center: {
    textAlign: 'center',
  },
});

export default RecipeExtractionProgressScreen;

