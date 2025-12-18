import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Chip, List, Text } from 'react-native-paper';

import LoadingIndicator from '../../components/LoadingIndicator';
import { useRecipe } from '../../hooks/useRecipes';
import { RecipesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeDetail'>;

const RecipeDetailScreen = ({ route, navigation }: Props) => {
  const { data: recipe, isLoading } = useRecipe(route.params.id);

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={recipe?.title ?? 'Recipe Detail'} />
      </Appbar.Header>
      {isLoading ? (
        <LoadingIndicator />
      ) : !recipe ? (
        <View style={styles.container}>
          <Text>Recipe not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Card style={styles.card}>
            <Card.Cover
              source={
                recipe.image_url
                  ? { uri: recipe.image_url }
                  : require('../../../assets/recipes/placeholder.png')
              }
            />
            <Card.Content>
              <Text variant="headlineSmall" style={styles.title}>
                {recipe.title}
              </Text>
              {recipe.description ? (
                <Text variant="bodyMedium" style={styles.description}>
                  {recipe.description}
                </Text>
              ) : null}
              <View style={styles.tags}>
                {recipe.tags.map((tag) => (
                  <Chip key={tag.id} compact style={styles.chip}>
                    {tag.name}
                  </Chip>
                ))}
              </View>
            </Card.Content>
          </Card>

          <List.Section title="Ingredients">
            {recipe.ingredients.map((item) => (
              <List.Item
                key={item.id}
                title={item.text}
                left={(props) => <List.Icon {...props} icon="checkbox-blank-circle-outline" />}
              />
            ))}
          </List.Section>

          <List.Section title="Steps">
            {recipe.steps.map((step) => (
              <List.Item
                key={step.id}
                title={`Step ${step.step_number}`}
                description={step.text}
                left={(props) => <List.Icon {...props} icon="numeric" />}
              />
            ))}
          </List.Section>
        </ScrollView>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  title: {
    marginTop: 12,
    marginBottom: 4,
  },
  description: {
    marginBottom: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#f1f5f9',
  },
});

export default RecipeDetailScreen;

