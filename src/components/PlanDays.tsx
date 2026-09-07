/**
 * A saved plan's days, as cards.
 *
 * Shared by the planner tab's "This week" block and the saved-plan screen, so
 * the same plan looks the same wherever it is read.
 */
import { StyleSheet, View } from 'react-native';
import { Card, Text, TouchableRipple, useTheme } from 'react-native-paper';

import { PlanItem, groupByDay } from '../services/plans';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * "Sunday 6".
 *
 * `new Date("2026-09-06")` parses as UTC midnight and renders as the PREVIOUS
 * day anywhere behind UTC. Appending a time forces local parsing.
 */
export const dayLabel = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = {
  items: PlanItem[];
  onPressMeal?: (item: PlanItem) => void;
};

const PlanDays = ({ items, onPressMeal }: Props) => {
  const theme = useTheme();
  const days = groupByDay(items);

  if (!days.length) {
    return (
      <Text variant="bodyMedium" style={styles.empty}>
        This plan has no meals in it.
      </Text>
    );
  }

  return (
    <>
      {days.map((day) => (
        <Card key={day.date} style={styles.card} mode="outlined">
          <Card.Title title={dayLabel(day.date)} titleVariant="titleMedium" />
          <Card.Content style={styles.content}>
            {day.meals.map((meal) => (
              <TouchableRipple
                key={`${day.date}-${meal.meal_type}-${meal.recipe_id}`}
                onPress={onPressMeal ? () => onPressMeal(meal) : undefined}
                disabled={!onPressMeal}
                accessibilityLabel={`${titleCase(meal.meal_type)}: ${meal.title ?? 'Recipe'}`}
              >
                <View style={styles.row}>
                  <Text
                    variant="labelMedium"
                    style={[styles.mealType, { color: theme.colors.onSurfaceVariant }]}
                  >
                    {titleCase(meal.meal_type)}
                  </Text>
                  <Text variant="bodyLarge" style={styles.title} numberOfLines={2}>
                    {meal.title ?? 'Recipe'}
                  </Text>
                  {meal.total_time_minutes ? (
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {meal.total_time_minutes}m
                    </Text>
                  ) : null}
                </View>
              </TouchableRipple>
            ))}
          </Card.Content>
        </Card>
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  card: { marginTop: 8 },
  content: { paddingHorizontal: 0, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  // Fixed width so the recipe titles line up down the column rather than
  // starting wherever "Breakfast" or "Lunch" happens to end.
  mealType: { width: 72 },
  // flexShrink, not flex: the time on the right must not squeeze the title to
  // nothing, but a long title should wrap rather than push the time off screen.
  title: { flex: 1 },
  empty: { marginTop: 12, opacity: 0.7 },
});

export default PlanDays;
