import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, Text } from 'react-native-paper';

import { getParseJobStatus } from '../../services/parseRecipe';
import { NewIngredient, ParsedRecipe } from '../../types/Recipe';
import { RecipesStackParamList } from '../../navigation/types';
import LoadingIndicator from '../../components/LoadingIndicator';

type Props = NativeStackScreenProps<RecipesStackParamList, 'ParseRecipeStatus'>;

type ClientState =
  | 'IDLE'
  | 'QUEUED'
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETE_SUCCESS'
  | 'COMPLETE_ERROR'
  | 'CANCELLED';

const mapParsedRecipeToParams = (recipe: ParsedRecipe, jobId: string, warnings?: string[]) => {
  const ingredients: NewIngredient[] =
    recipe.ingredients?.map((ing, idx) => ({
      id: `${Date.now()}-${idx}`,
      text: ing.text,
      quantityDisplay: ing.quantity_display ?? null,
      unit: ing.unit ?? null,
    })) ?? [];

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
      ingredients,
      steps: recipe.steps ?? [],
      notes: recipe.notes ?? [],
    },
    parseWarnings: warnings ?? [],
    parseJobId: jobId,
    parsedUrl: recipe.source_url ?? '',
  };
};

const ParseRecipeStatusScreen = ({ route, navigation }: Props) => {
  const { jobId, url } = route.params;
  const [status, setStatus] = useState<ClientState>('QUEUED');
  const [message, setMessage] = useState<string>('Your recipe is in the queue...');
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timer | null>(null);

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const job = await getParseJobStatus(jobId);
        if (job.status === 'PENDING') {
          setStatus('PENDING');
          setMessage('Your recipe is in the queue and waiting to be processed…');
          return;
        }
        if (job.status === 'RUNNING') {
          setStatus('RUNNING');
          setMessage('Your recipe is actively being processed…');
          return;
        }
        if (job.status === 'COMPLETE') {
          if (pollRef.current) clearInterval(pollRef.current);
          if (job.result?.success && job.result.recipe) {
            setStatus('COMPLETE_SUCCESS');
            const params = mapParsedRecipeToParams(job.result.recipe, job.id, job.result.warnings);
            navigation.replace('CreateRecipe', params as any);
          } else {
            setStatus('COMPLETE_ERROR');
            setError(job.result?.error_message || job.error_message || 'Unable to parse recipe.');
          }
          return;
        }
        if (job.status === 'ERROR') {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus('COMPLETE_ERROR');
          setError(job.error_message || 'Unable to parse recipe.');
          return;
        }
      } catch (err: any) {
        setError(err?.message || 'Unable to check status. Please try again.');
      }
    }, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, navigation, url]);

  const handleCancel = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus('CANCELLED');
    navigation.goBack();
  };

  const handleRetry = () => {
    navigation.replace('AddRecipeFromUrl', { initialUrl: url });
  };

  const handleManual = () => {
    navigation.replace('CreateRecipe', { parsedUrl: url } as any);
  };

  const isLoading = status === 'QUEUED' || status === 'PENDING' || status === 'RUNNING';

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={handleCancel} />
        <Appbar.Content title="Parsing recipe" />
      </Appbar.Header>
      <View style={styles.container}>
        {isLoading ? (
          <>
            <LoadingIndicator />
            <Text style={styles.status}>{message}</Text>
            <Button onPress={handleCancel}>Cancel</Button>
          </>
        ) : status === 'COMPLETE_ERROR' ? (
          <>
            <HelperText type="error" visible>
              {error ?? 'We could not parse that recipe.'}
            </HelperText>
            <Button mode="contained" onPress={handleRetry}>
              Try again
            </Button>
            <Button onPress={handleManual}>Add manually instead</Button>
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
  status: {
    textAlign: 'center',
  },
});

export default ParseRecipeStatusScreen;

