import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Appbar, Badge, Button, HelperText, List, Text } from 'react-native-paper';
import { Swipeable } from 'react-native-gesture-handler';

import LoadingIndicator from '../../components/LoadingIndicator';
import { useSeenJobs } from '../../hooks/useSeenJobs';
import { abandonParseJob, getParseJobs, getParseJobStatus } from '../../services/parseRecipe';
import { ParseJobPreview } from '../../types/ParseJob';
import { RecipesStackParamList } from '../../navigation/types';
import { ParsedRecipe } from '../../types/Recipe';

type Props = NativeStackScreenProps<RecipesStackParamList, 'Mailbox'>;

const formatTitle = (job: ParseJobPreview) =>
  job.preview?.title || job.preview?.source_host || job.url || 'Imported recipe';

const relativeTime = (iso?: string) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Completed ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Completed ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Completed ${days}d ago`;
};

const mapParsedRecipeToParams = (recipe: ParsedRecipe, jobId: string, warnings?: string[]) => {
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
          id: `${jobId}-${idx}`,
          text: ing.text,
          quantityDisplay: ing.quantity_display ?? null,
          unit: ing.unit ?? null,
        })) ?? [],
      steps: recipe.steps ?? [],
      notes: recipe.notes ?? [],
    },
    parseWarnings: warnings ?? [],
    parseJobId: jobId,
    parsedUrl: recipe.source_url ?? '',
  };
};

const MailboxScreen = ({ navigation }: Props) => {
  const [jobs, setJobs] = useState<ParseJobPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { seen, ready, markSeen } = useSeenJobs();

  const unseenCount = useMemo(() => {
    if (!ready) return 0;
    return jobs.filter((j) => !seen[j.id]).length;
  }, [jobs, ready, seen]);

  const fetchJobs = useCallback(async () => {
    setError(null);
    try {
      const res = await getParseJobs();
      setJobs(res.jobs || []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load mailbox.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchJobs();
    }, [fetchJobs]),
  );

  const handleOpenJob = async (job: ParseJobPreview) => {
    await markSeen([job.id]);
    try {
      const full = await getParseJobStatus(job.id);
      if (
        full.status !== 'COMPLETE' ||
        !full.result?.success ||
        !full.result.recipe
      ) {
        setError('This imported recipe is no longer available.');
        return;
      }
      const params = mapParsedRecipeToParams(full.result.recipe, job.id, full.result.warnings);
      navigation.navigate('CreateRecipe', params as any);
    } catch (err: any) {
      setError(err?.message || 'Unable to open that recipe.');
    }
  };

  const handleMarkAll = async () => {
    await markSeen(jobs.map((j) => j.id));
  };

  const handleCancel = (job: ParseJobPreview) => {
    Alert.alert('Discard this import?', 'This will remove the parsed recipe from your inbox.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            await abandonParseJob(job.id);
            setJobs((prev) => prev.filter((j) => j.id !== job.id));
          } catch (err: any) {
            setError(err?.response?.data?.detail || err?.message || 'Unable to discard job.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ParseJobPreview }) => {
    const unseen = !seen[item.id];
    return (
      <Swipeable
        renderRightActions={() => (
          <View style={styles.swipeContainer}>
            <Button
              mode="contained"
              onPress={() => handleCancel(item)}
              style={styles.swipeButton}
              textColor="#fff"
            >
              Cancel
            </Button>
          </View>
        )}
      >
        <List.Item
          title={formatTitle(item)}
          description={`${item.preview?.source_host ?? ''} ${relativeTime(item.completed_at)}`}
          onPress={() => handleOpenJob(item)}
          right={() => (unseen ? <Badge style={styles.dot}> </Badge> : null)}
          titleStyle={unseen ? styles.unseenTitle : undefined}
        />
      </Swipeable>
    );
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Mailbox" />
        <Appbar.Action icon="check" onPress={handleMarkAll} accessibilityLabel="Mark all as seen" />
      </Appbar.Header>
      <View style={styles.container}>
        {loading ? (
          <LoadingIndicator />
        ) : error ? (
          <>
            <HelperText type="error" visible>
              {error}
            </HelperText>
            <Button onPress={fetchJobs}>Retry</Button>
          </>
        ) : jobs.length === 0 ? (
          <Text>
            No imported recipes are waiting right now. Try adding a recipe from a URL to see it
            here.
          </Text>
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true) && fetchJobs()} />
            }
          />
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
  },
  dot: {
    marginTop: 12,
    backgroundColor: '#8A00C4',
  },
  unseenTitle: {
    fontWeight: '600',
  },
  swipeContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
  },
  swipeButton: {
    backgroundColor: '#ef4444',
  },
});

export default MailboxScreen;

