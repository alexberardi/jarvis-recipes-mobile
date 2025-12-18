import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState, useEffect } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Appbar, Button, Checkbox, HelperText, IconButton, Text, TextInput, Chip, useTheme } from 'react-native-paper';

import { PlannerStackParamList } from '../../navigation/types';
import { MealType, MealPlanGenerateRequest, MealSlotRequest } from '../../types/MealPlan';
import { generateMealPlanJob, saveMealPlanJob } from '../../services/mealPlans';
import { useTags } from '../../hooks/useTags';

type Props = NativeStackScreenProps<PlannerStackParamList, 'MealPlanDayConfig'>;

const mealOrder: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];

type PinnedRecipe = {
  id: string;
  title: string;
};

type MealConfig = {
  enabled: boolean;
  servings: string;
  tags: string;
  note: string;
  pinnedRecipe?: PinnedRecipe | null;
};

const defaultMealConfig = (): MealConfig => ({
  enabled: false,
  servings: '',
  tags: '',
  note: '',
  pinnedRecipe: null,
});

const MealPlanDayConfigScreen = ({ navigation, route }: Props) => {
  const dates = route.params?.dates ?? [];
  const { data: tagOptions } = useTags();
  const theme = useTheme();

  const [days, setDays] = useState<Record<string, Record<MealType, MealConfig>>>(() => {
    const initial: Record<string, Record<MealType, MealConfig>> = {};
    dates.forEach((date) => {
      initial[date] = {
        breakfast: defaultMealConfig(),
        lunch: defaultMealConfig(),
        dinner: defaultMealConfig(),
        snack: defaultMealConfig(),
        dessert: defaultMealConfig(),
      };
    });
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copyModal, setCopyModal] = useState<{ target?: string; visible: boolean }>({
    visible: false,
  });
  const [mealCopyModal, setMealCopyModal] = useState<{
    targetDate?: string;
    targetMeal?: MealType;
    visible: boolean;
  }>({ visible: false });
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Handle recipe selection callback - stored globally to avoid navigation params serialization
  useEffect(() => {
    const callback = (date: string, meal: string, recipe: { id: string; title: string } | null) => {
      setDays((prev) => ({
        ...prev,
        [date]: {
          ...prev[date],
          [meal as MealType]: {
            ...(prev[date]?.[meal as MealType] ?? defaultMealConfig()),
            pinnedRecipe: recipe,
          },
        },
      }));
    };
    // Store globally
    (global as any).__mealPlanRecipeSelectCallback = callback;
    return () => {
      delete (global as any).__mealPlanRecipeSelectCallback;
    };
  }, []);

  const toggleMeal = (date: string, meal: MealType, enabled: boolean) => {
    setDays((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [meal]: {
          ...(prev[date]?.[meal] ?? defaultMealConfig()),
          enabled,
        },
      },
    }));
  };

  const updateMealField = (date: string, meal: MealType, field: keyof MealConfig, value: string) => {
    setDays((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [meal]: {
          ...(prev[date]?.[meal] ?? defaultMealConfig()),
          [field]: value,
        },
      },
    }));
    // Clear field error when user types
    const errorKey = `${date}-${meal}-${field}`;
    if (fieldErrors[errorKey]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
  };

  const validateServings = (date: string, meal: MealType, value: string) => {
    const errorKey = `${date}-${meal}-servings`;
    if (!value.trim()) {
      setFieldErrors((prev) => ({ ...prev, [errorKey]: 'Servings required' }));
      return false;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) {
      setFieldErrors((prev) => ({ ...prev, [errorKey]: 'Servings must be at least 1' }));
      return false;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
    return true;
  };

  const buildRequest = (): MealPlanGenerateRequest | null => {
    const dayPayload = dates.map((date) => {
      const meals: any = {};
      mealOrder.forEach((m) => {
        const cfg = days[date]?.[m];
        if (cfg?.enabled) {
          const servingsNum = Number(cfg.servings);
          if (!Number.isFinite(servingsNum) || servingsNum < 1) {
            throw new Error(`Enter servings for ${m} on ${date}`);
          }
          const slot: MealSlotRequest = {
            servings: servingsNum,
          };
          const tags = cfg.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          if (tags.length) slot.tags = tags;
          if (cfg.note?.trim()) slot.note = cfg.note.trim();
          if (cfg.pinnedRecipe?.id) slot.pinned_recipe_id = cfg.pinnedRecipe.id;
          meals[m] = slot;
        }
      });
      return { date, meals };
    });

    const anyMeals = dayPayload.some((d) => Object.keys(d.meals).length > 0);
    if (!anyMeals) {
      setError('Select at least one meal and servings.');
      return null;
    }
    return { days: dayPayload };
  };

  const handleGenerate = async () => {
    Alert.alert('Generate plan?', 'Start meal plan generation for the selected days.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Generate',
        onPress: async () => {
          try {
            setError(null);
            const payload = buildRequest();
            if (!payload) return;
            setLoading(true);
            const job = await generateMealPlanJob(payload);
            await saveMealPlanJob(job.job_id, job.request_id);
            navigation.replace('MealPlanProgress', {
              jobId: job.job_id,
              requestId: job.request_id,
              startedAt: Date.now(),
            });
          } catch (err: any) {
            const msg = err?.response?.data?.detail || err?.message || 'Unable to start meal plan.';
            setError(msg);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const formattedDate = (date: string) => {
    const d = new Date(date);
    return `${d.toLocaleDateString(undefined, { weekday: 'long' })} - ${d.toLocaleDateString()}`;
  };

  const copyDay = (from: string, to: string) => {
    if (!days[from]) return;
    setDays((prev) => ({
      ...prev,
      [to]: JSON.parse(JSON.stringify(prev[from])),
    }));
  };

  const copyMeal = (fromDate: string, fromMeal: MealType, toDate: string, toMeal: MealType) => {
    const src = days[fromDate]?.[fromMeal];
    if (!src) return;
    setDays((prev) => ({
      ...prev,
      [toDate]: {
        ...(prev[toDate] ?? {}),
        [toMeal]: JSON.parse(JSON.stringify(src)),
      },
    }));
  };

  const tagChips = useMemo(
    () => (tagOptions ?? []).map((t) => t.name.toLowerCase()),
    [tagOptions],
  );
  const renderTagInput = (date: string, meal: MealType, cfg: MealConfig) => {
    const key = `${date}-${meal}`;
    const text = tagInputs[key] ?? '';
    const existing = cfg.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const suggestions = tagChips
      .filter((t) => t.includes(text.toLowerCase()) && !existing.map((e) => e.toLowerCase()).includes(t))
      .slice(0, 6);

    const setText = (val: string) =>
      setTagInputs((prev) => ({
        ...prev,
        [key]: val,
      }));

    return (
      <View style={styles.tags}>
        <Text variant="labelSmall">Tags</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Type to search tags"
          right={
            text ? (
              <TextInput.Icon
                icon="plus"
                onPress={() => {
                  if (!text.trim()) return;
                  const next = [...existing, text.trim()];
                  updateMealField(date, meal, 'tags', next.join(', '));
                  setText('');
                }}
              />
            ) : null
          }
        />
        <View style={styles.tagSelected}>
          {existing.map((tag) => (
            <Chip
              key={`${date}-${meal}-sel-${tag}`}
              onClose={() => {
                const next = existing.filter((t) => t !== tag);
                updateMealField(date, meal, 'tags', next.join(', '));
              }}
              compact
              mode="flat"
            >
              {tag}
            </Chip>
          ))}
        </View>
        <View style={styles.tagSuggestions}>
          {suggestions.map((tag) => (
            <Chip
              key={`${date}-${meal}-sug-${tag}`}
              compact
              mode="outlined"
              onPress={() => {
                const next = [...existing, tag];
                updateMealField(date, meal, 'tags', next.join(', '));
                setText('');
              }}
            >
              {tag}
            </Chip>
          ))}
        </View>
      </View>
    );
  };


  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Day configuration" />
        <Appbar.Action icon="play-circle" onPress={handleGenerate} />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.container}>
        {dates.map((date) => (
          <View key={date} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <Text variant="titleMedium">{formattedDate(date)}</Text>
              <IconButton
                icon="dots-vertical"
                onPress={() => setCopyModal({ visible: true, target: date })}
                disabled={
                  dates.length <= 1 ||
                  dates.filter((d) => d !== date && Object.keys(days[d] || {}).some((m) => (days[d] as any)?.[m]?.enabled)).length ===
                    0
                }
              />
            </View>
            {mealOrder.map((meal) => {
              const cfg = days[date]?.[meal];
              return (
                <View key={`${date}-${meal}`} style={styles.mealRow}>
                  <View style={styles.mealHeaderRow}>
                    <Checkbox.Item
                      label={meal}
                      status={cfg?.enabled ? 'checked' : 'unchecked'}
                      onPress={() => toggleMeal(date, meal, !cfg?.enabled)}
                      style={styles.checkboxTight}
                      labelStyle={styles.mealTitle}
                    />
                    {cfg?.enabled ? (
                      <>
                        <IconButton
                          icon="magnify"
                          size={18}
                          onPress={() =>
                            navigation.navigate('RecipeSearch', {
                              date,
                              meal,
                              currentPinnedId: cfg.pinnedRecipe?.id ?? null,
                            })
                          }
                        />
                        <IconButton
                          icon="content-copy"
                          size={18}
                          onPress={() => setMealCopyModal({ visible: true, targetDate: date, targetMeal: meal })}
                          disabled={
                            dates.filter(
                              (d) =>
                                d !== date &&
                                days[d]?.[meal]?.enabled &&
                                (days[d]?.[meal]?.servings || days[d]?.[meal]?.tags || days[d]?.[meal]?.note),
                            ).length === 0
                          }
                        />
                      </>
                    ) : null}
                  </View>
                  {cfg?.pinnedRecipe ? (
                    <View style={styles.pinnedRecipeRow}>
                      <IconButton
                        icon="pin"
                        size={16}
                        iconColor={theme.colors.primary}
                        onPress={() => {
                          setDays((prev) => ({
                            ...prev,
                            [date]: {
                              ...prev[date],
                              [meal]: {
                                ...(prev[date]?.[meal] ?? defaultMealConfig()),
                                pinnedRecipe: null,
                              },
                            },
                          }));
                        }}
                      />
                      <Text variant="bodyMedium" style={styles.pinnedRecipeTitle}>
                        {cfg.pinnedRecipe.title}
                      </Text>
                    </View>
                  ) : null}
                  {cfg?.enabled ? (
                    <View style={styles.mealDetails}>
                      <TextInput
                        label="Servings"
                        value={cfg.servings}
                        onChangeText={(t) => updateMealField(date, meal, 'servings', t)}
                        onBlur={() => validateServings(date, meal, cfg.servings)}
                        keyboardType="numeric"
                        error={!!fieldErrors[`${date}-${meal}-servings`]}
                      />
                      {fieldErrors[`${date}-${meal}-servings`] ? (
                        <HelperText type="error" visible>
                          {fieldErrors[`${date}-${meal}-servings`]}
                        </HelperText>
                      ) : null}
                      {!cfg.pinnedRecipe ? (
                        <>
                          {renderTagInput(date, meal, cfg)}
                          <TextInput
                            label="Note (optional)"
                            value={cfg.note}
                            onChangeText={(t) => updateMealField(date, meal, 'note', t)}
                            maxLength={200}
                          />
                        </>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
        {error ? (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        ) : null}
        <Button mode="contained" onPress={handleGenerate} loading={loading} disabled={loading}>
          Generate plan
        </Button>
      </ScrollView>
      <Modal
        visible={copyModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCopyModal({ visible: false })}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCopyModal({ visible: false })}
        >
          <View style={styles.modalCard}>
            <Text variant="titleMedium">Copy from</Text>
            {dates
              .filter(
                (d) =>
                  d !== copyModal.target &&
                  Object.values(days[d] ?? {}).some((m: any) => m?.enabled && (m.servings || m.tags || m.note)),
              )
              .map((d) => (
                <Button
                  key={`copy-${d}`}
                  onPress={() => {
                    if (copyModal.target) copyDay(d, copyModal.target);
                    setCopyModal({ visible: false });
                  }}
                >
                  {formattedDate(d)}
                </Button>
              ))}
            {dates.filter(
              (d) =>
                d !== copyModal.target &&
                Object.values(days[d] ?? {}).some((m: any) => m?.enabled && (m.servings || m.tags || m.note)),
            ).length === 0 ? (
              <Text>No other days to copy from.</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>
      <Modal
        visible={mealCopyModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setMealCopyModal({ visible: false })}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setMealCopyModal({ visible: false })}
        >
          <View style={styles.modalCard}>
            <Text variant="titleMedium">Copy meal from</Text>
            {mealCopyModal.visible &&
              dates
                .filter(
                  (d) =>
                    d !== mealCopyModal.targetDate &&
                    mealCopyModal.targetMeal &&
                    days[d]?.[mealCopyModal.targetMeal]?.enabled &&
                    (days[d]?.[mealCopyModal.targetMeal]?.servings ||
                      days[d]?.[mealCopyModal.targetMeal]?.tags ||
                      days[d]?.[mealCopyModal.targetMeal]?.note),
                )
                .map((d) => (
                  <Button
                    key={`copy-meal-${d}`}
                    onPress={() => {
                      if (mealCopyModal.targetDate && mealCopyModal.targetMeal) {
                        copyMeal(d, mealCopyModal.targetMeal, mealCopyModal.targetDate, mealCopyModal.targetMeal);
                      }
                      setMealCopyModal({ visible: false });
                    }}
                  >
                    {formattedDate(d)}
                  </Button>
                ))}
            {mealCopyModal.visible &&
            dates.filter(
              (d) =>
                d !== mealCopyModal.targetDate &&
                mealCopyModal.targetMeal &&
                days[d]?.[mealCopyModal.targetMeal]?.enabled &&
                (days[d]?.[mealCopyModal.targetMeal]?.servings ||
                  days[d]?.[mealCopyModal.targetMeal]?.tags ||
                  days[d]?.[mealCopyModal.targetMeal]?.note),
            ).length === 0 ? (
              <Text>No matching meals to copy from.</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  dayCard: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    gap: 8,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  mealDetails: {
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  mealHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealTitle: {
    textTransform: 'capitalize',
  },
  checkboxTight: {
    paddingVertical: 0,
    marginVertical: 0,
  },
  pinnedRecipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pinnedRecipeTitle: {
    flex: 1,
    marginLeft: 4,
  },
  tags: {
    gap: 6,
  },
  tagSelected: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagSuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#1c1c1e',
    padding: 16,
    borderRadius: 12,
    width: '90%',
    gap: 8,
  },
});

export default MealPlanDayConfigScreen;

