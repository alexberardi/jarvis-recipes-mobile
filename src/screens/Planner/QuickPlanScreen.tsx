/**
 * The default planning screen: pick days and meals, get a plan, re-roll what you
 * don't fancy.
 *
 * Deliberately one screen. The previous flow was date range -> day config ->
 * progress -> results, four steps with a spinner in the middle, for a task its
 * user already dislikes. Random selection is a database query, so there is
 * nothing to wait for and no reason to leave the page.
 *
 * The LLM planner still exists behind "Advanced" for when you want something
 * chosen rather than drawn.
 */
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  Divider,
  HelperText,
  IconButton,
  Text,
} from 'react-native-paper';

import PlanDays from '../../components/PlanDays';
import { PlannerStackParamList } from '../../navigation/types';
import { RandomSlotResult, randomPlan, rerollSlot } from '../../services/mealPlans';
import { Plan, getCurrentPlan } from '../../services/plans';

type Props = NativeStackScreenProps<PlannerStackParamList, 'QuickPlan'>;

const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
type Meal = (typeof MEALS)[number];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The next 7 days starting today, as ISO dates. */
const nextWeek = (): string[] => {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${DAY_LABELS[d.getDay()]} ${d.getDate()}`;
};

const QuickPlanScreen = ({ navigation }: Props) => {
  const week = useMemo(nextWeek, []);
  // Dinner-only for the whole week is the common case, so it is the default:
  // she can hit "Plan" immediately without configuring anything.
  const [days, setDays] = useState<Set<string>>(() => new Set(week));
  const [meals, setMeals] = useState<Set<Meal>>(() => new Set<Meal>(['dinner']));
  const [slots, setSlots] = useState<RandomSlotResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [rerolling, setRerolling] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Plan | null>(null);
  const [loadingSaved, setLoadingSaved] = useState(true);

  // On focus, not on mount: committing a plan happens on another screen in this
  // same stack, so a mount-only fetch would show a stale "nothing planned" right
  // after the plan was saved.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getCurrentPlan()
        .then((plan) => {
          if (!cancelled) setSaved(plan);
        })
        .catch(() => {
          // A failed lookup is not worth an error banner over the planner: the
          // picker below still works, which is what someone opening this tab
          // came to do.
          if (!cancelled) setSaved(null);
        })
        .finally(() => {
          if (!cancelled) setLoadingSaved(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    return next;
  };

  const requested = useMemo(
    () =>
      Array.from(days)
        .sort()
        // Ordered by time of day, not by the order the chips were tapped. A Set
        // iterates in insertion order, so adding breakfast after dinner listed
        // Tuesday's dinner above Tuesday's breakfast in the plan below.
        .flatMap((date) =>
          MEALS.filter((meal) => meals.has(meal)).map((meal_type) => ({ date, meal_type })),
        ),
    [days, meals],
  );

  const chosenIds = useMemo(
    () => (slots ?? []).map((s) => s.recipe_id).filter((id): id is number => typeof id === 'number'),
    [slots],
  );

  const generate = useCallback(async () => {
    if (!requested.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await randomPlan(requested);
      setSlots(res.slots);
      if (res.incomplete) {
        setError('Not enough recipes to fill every meal. Add a few more, or plan fewer days.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not build a plan.');
    } finally {
      setBusy(false);
    }
  }, [requested]);

  const rerollAll = useCallback(async () => {
    if (!slots?.length) return;
    setBusy(true);
    setError(null);
    try {
      // Everything currently shown is excluded, so a full re-roll genuinely
      // changes the plan rather than reshuffling the same recipes.
      const res = await randomPlan(requested, chosenIds);
      setSlots(res.slots);
      if (res.incomplete) {
        setError('Ran out of different recipes — some slots kept their pick.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not re-roll.');
    } finally {
      setBusy(false);
    }
  }, [slots, requested, chosenIds]);

  const rerollOne = useCallback(
    async (index: number) => {
      const slot = slots?.[index];
      if (!slot) return;
      setRerolling(index);
      setError(null);
      try {
        const replacement = await rerollSlot(slot.meal_type, chosenIds);
        setSlots((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          // Keep the slot's own date; the re-roll only supplies the recipe.
          next[index] = { ...replacement, date: slot.date, meal_type: slot.meal_type };
          return next;
        });
      } catch (err: any) {
        setError(
          err?.response?.status === 409
            ? 'No other recipe to swap in. Add more recipes to your box.'
            : err?.response?.data?.detail || err?.message || 'Could not re-roll that meal.',
        );
      } finally {
        setRerolling(null);
      }
    },
    [slots, chosenIds],
  );

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Plan the week" />
        <Appbar.Action
          icon="format-list-bulleted"
          onPress={() => navigation.navigate('MealPlanList')}
          accessibilityLabel="Saved plans"
        />
        <Appbar.Action
          icon="tune"
          onPress={() => navigation.navigate('MealPlanDateRange')}
          accessibilityLabel="Advanced planning"
        />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.container}>
        {/* The saved plan comes FIRST. "What are we eating tonight" is the
            question this tab is opened to answer; making someone scroll past a
            picker to reach the answer they already saved gets it backwards. */}
        {loadingSaved ? null : saved ? (
          <View style={styles.savedBlock}>
            <View style={styles.planHeader}>
              <Text variant="titleMedium" style={styles.planTitle}>
                {saved.name || 'Your plan'}
              </Text>
              <Button
                compact
                onPress={() => navigation.navigate('SavedPlan', { planId: saved.id })}
              >
                Open
              </Button>
            </View>
            <PlanDays
              items={saved.items}
              onPressMeal={(meal) =>
                navigation.getParent()?.navigate('RecipesTab', {
                  screen: 'RecipeDetail',
                  params: { id: meal.recipe_id },
                })
              }
            />
            <Divider style={styles.savedDivider} />
            <Text variant="labelLarge">Plan more days</Text>
          </View>
        ) : null}

        <Text variant="labelLarge">Days</Text>
        <View style={styles.chips}>
          {week.map((date) => (
            <Chip
              key={date}
              selected={days.has(date)}
              mode={days.has(date) ? 'flat' : 'outlined'}
              onPress={() => setDays((d) => toggle(d, date))}
            >
              {dayLabel(date)}
            </Chip>
          ))}
        </View>

        <Text variant="labelLarge">Meals</Text>
        <View style={styles.chips}>
          {MEALS.map((meal) => (
            <Chip
              key={meal}
              selected={meals.has(meal)}
              mode={meals.has(meal) ? 'flat' : 'outlined'}
              onPress={() => setMeals((m) => toggle(m, meal))}
            >
              {meal[0].toUpperCase() + meal.slice(1)}
            </Chip>
          ))}
        </View>

        <Button
          mode="contained"
          onPress={generate}
          disabled={busy || !requested.length}
          style={styles.action}
        >
          {slots ? `Re-plan ${requested.length} meals` : `Plan ${requested.length} meals`}
        </Button>

        {error ? (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        ) : null}

        {busy ? <ActivityIndicator style={styles.action} /> : null}

        {slots?.length ? (
          <>
            <Divider style={styles.action} />
            <View style={styles.planHeader}>
              <Text variant="titleMedium" style={styles.planTitle}>
                Your week
              </Text>
              <Button compact onPress={rerollAll} disabled={busy}>
                Re-roll all
              </Button>
            </View>

            {slots.map((slot, index) => (
              <Card key={`${slot.date}-${slot.meal_type}`} style={styles.card} mode="outlined">
                <Card.Title
                  title={slot.title ?? 'No recipe yet'}
                  subtitle={`${dayLabel(slot.date ?? '')} · ${slot.meal_type}${
                    slot.total_time_minutes ? ` · ${slot.total_time_minutes} min` : ''
                  }`}
                  titleStyle={slot.recipe_id ? undefined : styles.emptyTitle}
                  right={() =>
                    rerolling === index ? (
                      <ActivityIndicator style={styles.cardSpinner} />
                    ) : (
                      <IconButton
                        icon="dice-5-outline"
                        onPress={() => rerollOne(index)}
                        disabled={busy}
                        accessibilityLabel={`Re-roll ${slot.meal_type} on ${slot.date}`}
                      />
                    )
                  }
                />
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, paddingBottom: 48 },
  savedBlock: { gap: 8 },
  savedDivider: { marginTop: 20, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  action: { marginTop: 12 },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  // Without this the button squeezes the label and "Your week" renders as
  // "Your" -- Text shrinks by default inside a row.
  planTitle: { flexShrink: 0 },
  card: { marginTop: 8 },
  cardSpinner: { marginRight: 16 },
  emptyTitle: { opacity: 0.5 },
});

export default QuickPlanScreen;
