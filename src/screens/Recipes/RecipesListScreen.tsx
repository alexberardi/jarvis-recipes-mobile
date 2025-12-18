import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Appbar, Badge, Button, Text } from 'react-native-paper';

import LoadingIndicator from '../../components/LoadingIndicator';
import RecipeCard from '../../components/RecipeCard';
import { useRecipes } from '../../hooks/useRecipes';
import { useSeenJobs } from '../../hooks/useSeenJobs';
import { getParseJobs } from '../../services/parseRecipe';
import { RecipesStackParamList } from '../../navigation/types';
import { loadActiveJob, clearActiveJob } from '../../services/jobPolling';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipesList'>;

const RecipesListScreen = ({ navigation }: Props) => {
  const { data: recipes, isLoading, isRefetching, refetch, error } = useRecipes();
  const { seen, ready, markSeen } = useSeenJobs();
  const [jobsCount, setJobsCount] = useState(0);
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    const loadMailbox = async () => {
      try {
        const res = await getParseJobs();
        const total = res.jobs?.length ?? 0;
        const unseen = res.jobs?.filter((j) => !seen[j.id]).length ?? 0;
        setJobsCount(total);
        setUnseenCount(unseen);
      } catch {
        setJobsCount(0);
        setUnseenCount(0);
      }
    };
    if (ready) loadMailbox();
  }, [ready, seen]);

  const handleAddRecipe = () => {
    navigation.navigate('AddRecipeMode');
  };

  const handleOpenMailbox = () => {
    navigation.navigate('Mailbox');
  };

  useEffect(() => {
    const resumeJob = async () => {
      const job = await loadActiveJob();
      if (job?.jobId) {
        navigation.navigate('ImportJobStatus', {
          jobId: job.jobId,
          jobType: job.jobType,
          sourceUrl: job.sourceUrl,
          startedAt: job.startedAt,
        });
      } else {
        await clearActiveJob();
      }
    };
    resumeJob();
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }) => (
      <RecipeCard
        recipe={item}
        onPress={() => navigation.navigate('RecipeDetail', { id: item.id })}
      />
    ),
    [navigation],
  );

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Recipes" />
        <View>
          <Appbar.Action icon="bell-outline" onPress={handleOpenMailbox} />
          {unseenCount > 0 ? <Badge style={styles.badge}>{unseenCount}</Badge> : null}
        </View>
        <Appbar.Action icon="plus" onPress={handleAddRecipe} />
      </Appbar.Header>
      {isLoading ? (
        <LoadingIndicator />
      ) : error ? (
        <Text style={styles.errorText}>
          Unable to load recipes. Pull to refresh to retry.
        </Text>
      ) : (
        <FlatList
          data={recipes ?? []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No recipes available yet.</Text>
          }
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  list: {
    padding: 16,
    gap: 12,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 32,
  },
  errorText: {
    padding: 16,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
});

export default RecipesListScreen;

