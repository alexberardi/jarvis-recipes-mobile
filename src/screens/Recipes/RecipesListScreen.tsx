import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Badge, Button, Chip, Searchbar, Text, TextInput } from 'react-native-paper';

import LoadingIndicator from '../../components/LoadingIndicator';
import RecipeCard from '../../components/RecipeCard';
import { useRecipes } from '../../hooks/useRecipes';
import { useSeenJobs } from '../../hooks/useSeenJobs';
import { getParseJobs } from '../../services/parseRecipe';
import { RecipesStackParamList } from '../../navigation/types';
import { loadActiveJob, clearActiveJob } from '../../services/jobPolling';
import { Recipe } from '../../types/Recipe';
import { availableTags, filterRecipes } from '../../utils/filterRecipes';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipesList'>;

const RecipesListScreen = ({ navigation }: Props) => {
  const { data: recipes, isLoading, isRefetching, refetch, error } = useRecipes();
  const { seen, ready, markSeen } = useSeenJobs();
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ingredient, setIngredient] = useState('');
  // Ingredient search is behind a toggle: it answers a different question
  // ("what can I make with the chicken in the fridge?") and having both fields
  // open at once made the top of the list all controls and no recipes.
  const [advanced, setAdvanced] = useState(false);
  const [jobsCount, setJobsCount] = useState(0);
  const [unseenCount, setUnseenCount] = useState(0);
  const tags = useMemo(() => availableTags(recipes ?? []), [recipes]);
  const visible = useMemo(
    () => filterRecipes(recipes ?? [], { query, tags: selectedTags, ingredient }),
    [recipes, query, selectedTags, ingredient],
  );
  const filtering = Boolean(query.trim() || ingredient.trim() || selectedTags.length);

  const toggleTag = (name: string) =>
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name],
    );

  const clearFilters = () => {
    setQuery('');
    setIngredient('');
    setSelectedTags([]);
  };


  const loadMailbox = useCallback(async () => {
    if (!ready) return;
    try {
      const res = await getParseJobs();
      const total = res.jobs?.length ?? 0;
      const unseen = res.jobs?.filter((j) => !seen[j.id]).length ?? 0;
      setJobsCount(total);
      setUnseenCount(unseen);
    } catch (error) {
      console.warn('[RecipesList] Failed to load mailbox count:', error instanceof Error ? error.message : String(error));
      setJobsCount(0);
      setUnseenCount(0);
    }
  }, [ready, seen]);

  // Load mailbox count when screen comes into focus (e.g., after returning from Mailbox)
  useFocusEffect(
    useCallback(() => {
      loadMailbox();
    }, [loadMailbox]),
  );

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
          sourceUrl: job.sourceUrl ?? undefined,
          startedAt: job.startedAt,
        });
      } else {
        await clearActiveJob();
      }
    };
    resumeJob();
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: Recipe }) => (
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
          <Appbar.Action
            icon="mailbox-outline"
            onPress={handleOpenMailbox}
            accessibilityLabel="Import mailbox"
          />
          {unseenCount > 0 ? <Badge style={styles.badge}>{unseenCount}</Badge> : null}
        </View>
        <Appbar.Action icon="plus" onPress={handleAddRecipe} accessibilityLabel="Add recipe" />
      </Appbar.Header>
      {isLoading ? (
        <LoadingIndicator />
      ) : error ? (
        <Text style={styles.errorText}>
          Unable to load recipes. Pull to refresh to retry.
        </Text>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListHeaderComponent={
            <View style={styles.filters}>
              <Searchbar
                placeholder="Search recipes"
                value={query}
                onChangeText={setQuery}
                onClearIconPress={() => setQuery('')}
              />

              {tags.length ? (
                // Horizontal, so a long tag list does not push the recipes off
                // the screen the way a wrapping row did.
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tagRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {tags.map((name) => (
                    <Chip
                      key={name}
                      selected={selectedTags.includes(name)}
                      mode={selectedTags.includes(name) ? 'flat' : 'outlined'}
                      onPress={() => toggleTag(name)}
                      accessibilityLabel={`Filter by ${name}`}
                    >
                      {name}
                    </Chip>
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.filterActions}>
                <Button
                  compact
                  icon={advanced ? 'chevron-up' : 'chevron-down'}
                  onPress={() => setAdvanced((open) => !open)}
                >
                  {advanced ? 'Hide advanced' : 'Advanced'}
                </Button>
                {filtering ? (
                  <Button compact onPress={clearFilters}>
                    Clear
                  </Button>
                ) : null}
              </View>

              {advanced ? (
                <TextInput
                  mode="outlined"
                  label="Has ingredient"
                  placeholder="chicken, potatoes, gochujang"
                  value={ingredient}
                  onChangeText={setIngredient}
                  autoCapitalize="none"
                  // Paper renders `label` as a Text node inside the input, not
                  // as an accessibility label, so screen readers get nothing
                  // from it on its own.
                  accessibilityLabel="Has ingredient"
                  right={
                    ingredient ? (
                      <TextInput.Icon icon="close" onPress={() => setIngredient('')} />
                    ) : undefined
                  }
                />
              ) : null}
            </View>
          }
          ListEmptyComponent={
            // Two different situations: an empty box needs "add a recipe", a
            // filtered-to-nothing box needs "loosen the filter". Showing "no
            // recipes yet" to someone with 46 of them reads as data loss.
            <Text style={styles.emptyText}>
              {filtering
                ? 'No recipes match those filters.'
                : 'No recipes available yet.'}
            </Text>
          }
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  filters: { gap: 8, paddingBottom: 12 },
  tagRow: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  filterActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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

