/**
 * The library of saved plans.
 *
 * This screen used to be a dead end -- registered in the navigator, reached by
 * nothing, and showing a button to the planner that the planner already is.
 * Committing a plan wrote it to the database and there was no screen anywhere
 * that read it back.
 */
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, HelperText, Text, useTheme } from 'react-native-paper';

import LoadingIndicator from '../../components/LoadingIndicator';
import { dayLabel } from '../../components/PlanDays';
import { PlannerStackParamList } from '../../navigation/types';
import { PlanSummary, listPlans } from '../../services/plans';

type Props = NativeStackScreenProps<PlannerStackParamList, 'MealPlanList'>;

const span = (plan: PlanSummary) =>
  plan.start_date === plan.end_date
    ? dayLabel(plan.start_date)
    : `${dayLabel(plan.start_date)} – ${dayLabel(plan.end_date)}`;

const MealPlanListScreen = ({ navigation }: Props) => {
  const theme = useTheme();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlans(await listPlans());
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not load your plans.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // On focus: deleting a plan on the detail screen pops back here, and a
  // mount-only fetch would leave the deleted row on screen.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Saved plans" />
      </Appbar.Header>

      {error ? (
        <View style={styles.banner}>
          <HelperText type="error" visible>
            {error}
          </HelperText>
          <Button compact onPress={load}>
            Retry
          </Button>
        </View>
      ) : null}

      {loading ? (
        <LoadingIndicator />
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(plan) => String(plan.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="bodyLarge">No saved plans yet.</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                Plan a week and save it, and it will show up here.
              </Text>
              <Button mode="contained" onPress={() => navigation.goBack()} style={styles.cta}>
                Plan the week
              </Button>
            </View>
          }
          renderItem={({ item }) => (
            <Card
              style={styles.card}
              mode="outlined"
              onPress={() => navigation.navigate('SavedPlan', { planId: item.id })}
              accessibilityLabel={`${item.name || 'Meal plan'}, ${span(item)}`}
            >
              <Card.Title
                title={item.name || span(item)}
                subtitle={
                  item.name
                    ? `${span(item)} · ${item.meal_count} meals`
                    : `${item.meal_count} meals`
                }
              />
            </Card>
          )}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8, flexGrow: 1 },
  card: { marginBottom: 8 },
  banner: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  cta: { marginTop: 12 },
});

export default MealPlanListScreen;
