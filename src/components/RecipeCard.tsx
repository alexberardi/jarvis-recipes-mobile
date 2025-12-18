import { StyleSheet, View } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';

import { Recipe } from '../types/Recipe';

type Props = {
  recipe: Recipe;
  onPress?: () => void;
};

const RecipeCard = ({ recipe, onPress }: Props) => {
  const theme = useTheme();
  const chipBg = theme.colors.surfaceVariant;
  const chipBorder = theme.colors.outlineVariant;
  const descriptionColor = theme.colors.onSurfaceVariant;

  return (
    <Card style={styles.card} onPress={onPress} mode="elevated">
      <Card.Cover
        source={
          recipe.image_url
            ? { uri: recipe.image_url }
            : require('../../assets/recipes/placeholder.png')
        }
        style={styles.cover}
      />
      <Card.Content>
        <Text variant="titleMedium" style={styles.title}>
          {recipe.title}
        </Text>
        {recipe.description ? (
          <Text variant="bodyMedium" style={[styles.description, { color: descriptionColor }]} numberOfLines={2}>
            {recipe.description}
          </Text>
        ) : null}
        <View style={styles.tags}>
          {recipe.tags.slice(0, 3).map((tag) => (
            <Chip
              key={tag.id}
              compact
              style={[
                styles.chip,
                {
                  backgroundColor: chipBg,
                  borderColor: chipBorder,
                },
              ]}
              textStyle={{ color: theme.colors.onSurface }}
            >
              {tag.name}
            </Chip>
          ))}
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  cover: {
    height: 180,
  },
  title: {
    marginTop: 8,
    marginBottom: 4,
  },
  description: {
    color: '#475569',
    marginBottom: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: '#f1f5f9',
  },
});

export default RecipeCard;

