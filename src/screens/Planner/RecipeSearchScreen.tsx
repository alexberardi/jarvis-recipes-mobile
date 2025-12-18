import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState, useMemo } from 'react';
import { ScrollView, StyleSheet, View, Pressable, RefreshControl } from 'react-native';
import { Appbar, Card, Chip, Searchbar, Text, Button } from 'react-native-paper';

import { PlannerStackParamList } from '../../navigation/types';
import { useRecipes } from '../../hooks/useRecipes';
import { Recipe } from '../../types/Recipe';

type Props = NativeStackScreenProps<PlannerStackParamList, 'RecipeSearch'>;

const RecipeSearchScreen = ({ navigation, route }: Props) => {
  const { date, meal, currentPinnedId } = route.params;
  const { data: recipes, isLoading, refetch } = useRecipes();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filteredRecipes = useMemo(() => {
    if (!recipes) return [];
    const query = searchQuery.toLowerCase().trim();
    if (!query) return recipes;
    return recipes.filter((r) => r.title?.toLowerCase().includes(query));
  }, [recipes, searchQuery]);

  const handleSelectRecipe = (recipe: Recipe) => {
    const callback = (global as any).__mealPlanRecipeSelectCallback;
    if (callback) {
      callback(date, meal, {
        id: String(recipe.id),
        title: recipe.title,
      });
    }
    navigation.goBack();
  };

  const handleClearSelection = () => {
    const callback = (global as any).__mealPlanRecipeSelectCallback;
    if (callback) {
      callback(date, meal, null);
    }
    navigation.goBack();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Select recipe" />
      </Appbar.Header>
      <View style={styles.container}>
        <Searchbar
          placeholder="Search recipes by title"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
        {currentPinnedId ? (
          <Button
            mode="outlined"
            onPress={handleClearSelection}
            style={styles.clearButton}
            icon="pin-off"
          >
            Clear selection
          </Button>
        ) : null}
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            filteredRecipes.length === 0 && styles.scrollContentEmpty,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {isLoading ? (
            <View style={styles.center}>
              <Text>Loading recipes…</Text>
            </View>
          ) : filteredRecipes.length === 0 ? (
            <View style={styles.center}>
              <Text>
                {searchQuery ? 'No recipes match your search.' : 'No recipes found.'}
              </Text>
            </View>
          ) : (
            filteredRecipes.map((recipe) => (
              <Pressable key={recipe.id} onPress={() => handleSelectRecipe(recipe)}>
                <Card style={styles.card}>
                  {recipe.image_url ? (
                    <Card.Cover source={{ uri: recipe.image_url }} style={styles.cardImage} />
                  ) : null}
                  <Card.Content>
                    <Text variant="titleMedium">{recipe.title}</Text>
                    {recipe.tags?.length ? (
                      <View style={styles.tags}>
                        {recipe.tags.slice(0, 5).map((tag) => (
                          <Chip key={tag.id} compact style={styles.chip}>
                            {tag.name}
                          </Chip>
                        ))}
                      </View>
                    ) : null}
                  </Card.Content>
                </Card>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  searchBar: {
    marginBottom: 12,
  },
  clearButton: {
    marginBottom: 12,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 16,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  center: {
    padding: 24,
    alignItems: 'center',
  },
  card: {
    marginBottom: 8,
  },
  cardImage: {
    height: 120,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    marginRight: 4,
  },
});

export default RecipeSearchScreen;

