import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Appbar, Button, HelperText, ProgressBar, Text } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';
import { clearMealPlanJob, getMealPlanJob } from '../../services/mealPlans';
import { pollWithBackoff } from '../../services/jobPolling';

type Props = NativeStackScreenProps<PlannerStackParamList, 'MealPlanProgress'>;

const MealPlanProgressScreen = ({ navigation, route }: Props) => {
  const { jobId, requestId } = route.params;
  const [message, setMessage] = useState<string>('Generating your meal plan…');
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const aborter = new AbortController();
    abortRef.current = aborter;
    const run = async () => {
      try {
        const res = await pollWithBackoff(
          () => getMealPlanJob(jobId),
          (p) => p.status === 'COMPLETE' || p.status === 'ERROR',
          { signal: aborter.signal, timeoutMs: 120_000 },
        );

        if (res.status === 'COMPLETE') {
          await clearMealPlanJob();
          navigation.replace('MealPlanResults', { jobId, requestId });
          return;
        }

        setError(res.error_message || 'Unable to generate meal plan.');
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err?.message || 'Unable to generate meal plan.');
      }
    };
    run();
    return () => abortRef.current?.abort();
  }, [jobId, navigation, requestId]);

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction
          onPress={async () => {
            abortRef.current?.abort();
            await clearMealPlanJob();
            navigation.goBack();
          }}
        />
        <Appbar.Content title="Generating plan" />
      </Appbar.Header>
      <View style={styles.container}>
        {!error ? (
          <>
            <Text variant="bodyLarge">{message}</Text>
            {progress != null ? <ProgressBar progress={progress} /> : null}
            <Button
              onPress={async () => {
                abortRef.current?.abort();
                await clearMealPlanJob();
                navigation.goBack();
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <HelperText type="error" visible>
              {error}
            </HelperText>
            <Button
              mode="contained"
              onPress={() =>
                navigation.replace('MealPlanProgress', {
                  jobId,
                  requestId,
                  startedAt: Date.now(),
                })
              }
            >
              Retry
            </Button>
            <Button onPress={() => navigation.goBack()}>Back</Button>
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
});

export default MealPlanProgressScreen;

