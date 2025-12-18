import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, List, Text } from 'react-native-paper';

import LoadingIndicator from '../../components/LoadingIndicator';
import { useWeeklyPlan } from '../../hooks/useWeeklyPlan';
import { PlannerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PlannerStackParamList, 'WeeklyPlan'>;

const WeeklyPlanScreen = ({ navigation }: Props) => {
  const { data, isLoading } = useWeeklyPlan();

  const mealsByDay = useMemo(() => {
    if (!data) return {};
    return data.meals.reduce<Record<string, typeof data.meals>>((acc, meal) => {
      if (!acc[meal.day]) acc[meal.day] = [];
      acc[meal.day].push(meal);
      return acc;
    }, {});
  }, [data]);

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Weekly Plan" />
      </Appbar.Header>
      {isLoading ? (
        <LoadingIndicator />
      ) : !data ? (
        <View style={styles.container}>
          <Text>No plan available yet.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text variant="titleMedium">Week of {data.weekOf}</Text>
              <Text variant="bodyMedium">Tap a meal to open its recipe.</Text>
            </Card.Content>
          </Card>

          {Object.entries(mealsByDay).map(([day, meals]) => (
            <List.Section key={day} title={day}>
              {meals.map((meal) => (
                <List.Item
                  key={meal.id}
                  title={`${meal.mealType}: ${meal.recipe?.title ?? 'TBD'}`}
                  description={
                    meal.recipe?.tags
                      ? meal.recipe.tags.map((t) => t.name).join(', ')
                      : 'Recipe details coming soon'
                  }
                  left={(props) => <List.Icon {...props} icon="calendar" />}
                  onPress={() => {
                    const numericId = Number(meal.recipeId);
                    if (Number.isFinite(numericId)) {
                      navigation.navigate('RecipeDetail', { id: numericId });
                    }
                  }}
                />
              ))}
            </List.Section>
          ))}
        </ScrollView>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    marginBottom: 8,
  },
});

export default WeeklyPlanScreen;

