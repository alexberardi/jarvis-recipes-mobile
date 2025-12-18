import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  Alert,
} from 'react-native';
import {
  Appbar,
  Button,
  Chip,
  HelperText,
  IconButton,
  Text,
  TextInput,
} from 'react-native-paper';
import type { TextInput as PaperTextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createRecipe, uploadRecipeImage } from '../../services/recipes';
import { abandonParseJob } from '../../services/parseRecipe';
import { useTags } from '../../hooks/useTags';
import { RECIPES_QUERY_KEY } from '../../hooks/useRecipes';
import {
  getStockIngredients,
  getStockUnits,
  searchIngredients,
  searchUnits,
} from '../../services/stockData';
import { NewIngredient, Recipe, RecipeCreate } from '../../types/Recipe';
import { RecipesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RecipesStackParamList, 'CreateRecipe'>;

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const CreateRecipeScreen = ({ navigation, route }: Props) => {
  const queryClient = useQueryClient();
  const { data: tagOptions } = useTags();
  const presetQty = ['1/4', '1/3', '1/2', '3/4', '1', '1 1/2', '2', '3'];

  const initialRecipe = (route.params as any)?.initialRecipe;
  const parseWarnings = (route.params as any)?.parseWarnings as string[] | undefined;
  const parseJobId = (route.params as any)?.parseJobId as string | undefined;
  const [title, setTitle] = useState(initialRecipe?.title ?? '');
  const [description, setDescription] = useState(initialRecipe?.description ?? '');
  const [prepMinutes, setPrepMinutes] = useState(
    initialRecipe?.prepMinutes != null ? String(initialRecipe.prepMinutes) : '',
  );
  const [cookMinutes, setCookMinutes] = useState(
    initialRecipe?.cookMinutes != null ? String(initialRecipe.cookMinutes) : '',
  );
  const [servings, setServings] = useState(
    initialRecipe?.servings != null ? String(initialRecipe.servings) : '',
  );
  const [ingredients, setIngredients] = useState<NewIngredient[]>(
    initialRecipe?.ingredients?.length
      ? initialRecipe.ingredients.map((ing: any, idx: number) => ({
          id: ing.id ?? `${Date.now()}-${idx}`,
          text: ing.text ?? '',
          quantityDisplay: ing.quantityDisplay ?? ing.quantity_display ?? '',
          unit: ing.unit ?? '',
        }))
      : [{ id: generateId(), text: '', quantityDisplay: '', unit: '' }],
  );
  const [steps, setSteps] = useState<string[]>(
    initialRecipe?.steps?.length ? initialRecipe.steps : [''],
  );
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialRecipe?.tags ?? []);
  const [imageUrl, setImageUrl] = useState(initialRecipe?.imageUrl ?? '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [autocompleteAvailable, setAutocompleteAvailable] = useState(true);
  const [hasStockData, setHasStockData] = useState(true);
  const [focusedIngredientId, setFocusedIngredientId] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'qty' | 'unit' | 'text' | null>(null);
  const [invalidIngredientIds, setInvalidIngredientIds] = useState<Set<string>>(new Set());
  const unitRefs = useRef<Record<string, ComponentRef<typeof TextInput> | null>>({});
  const qtyRefs = useRef<Record<string, ComponentRef<typeof TextInput> | null>>({});
  const [stepHeights, setStepHeights] = useState<number[]>([80]);
  const totalMinutes = useMemo(() => {
    const prep = Number(prepMinutes);
    const cook = Number(cookMinutes);
    if (Number.isFinite(prep) || Number.isFinite(cook)) {
      return (Number.isFinite(prep) ? prep : 0) + (Number.isFinite(cook) ? cook : 0);
    }
    return undefined;
  }, [prepMinutes, cookMinutes]);

  const suggestions = useMemo(() => {
    if (!tagOptions || !tagInput) return [];
    const lower = tagInput.toLowerCase();
    return tagOptions
      .filter((t) => t.name.toLowerCase().includes(lower) && !tags.includes(t.name))
      .slice(0, 5);
  }, [tagInput, tagOptions, tags]);

  useEffect(() => {
    const loadStock = async () => {
      try {
        const [ings, units] = await Promise.all([getStockIngredients(), getStockUnits()]);
        const hasData = Boolean((ings && ings.length) || (units && units.length));
        setHasStockData(hasData);
        setAutocompleteAvailable(hasData);
      } catch {
        setHasStockData(false);
        setAutocompleteAvailable(false);
      }
    };
    loadStock();
  }, []);

  const canSubmit =
    title.trim().length > 0 &&
    ingredients.filter((i) => i.text.trim()).length >= 1 &&
    steps.filter((s) => s.trim()).length >= 1;

  const { mutateAsync: submitRecipe, isPending } = useMutation<
    Recipe,
    Error,
    RecipeCreate & { parse_job_id?: string }
  >({
    mutationFn: createRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    },
  });

  const handleAddIngredient = () =>
    setIngredients((prev) => [
      ...prev,
      { id: generateId(), text: '', quantityDisplay: '', unit: '' },
    ]);

  const updateIngredient = (id: string, patch: Partial<NewIngredient>) =>
    setIngredients((prev) => prev.map((ing) => (ing.id === id ? { ...ing, ...patch } : ing)));

  const handleRemoveIngredient = (id: string) =>
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));

  const handleAddStep = () => {
    setSteps((prev) => [...prev, '']);
    setStepHeights((prev) => [...prev, 80]);
  };
  const handleStepChange = (text: string, index: number) =>
    setSteps((prev) => prev.map((item, i) => (i === index ? text : item)));
  const handleRemoveStep = (index: number) =>
    setSteps((prev) => prev.filter((_, i) => i !== index));

  const handleAddTag = (name?: string) => {
    const value = (name ?? tagInput).trim();
    if (!value || tags.includes(value)) return;
    setTags((prev) => [...prev, value]);
    setTagInput('');
  };

  const handleRemoveTag = (name: string) =>
    setTags((prev) => prev.filter((tag) => tag !== name));

  const pickImage = async () => {
    setSubmitError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setSubmitError('Media library permission is required to pick an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const url = await uploadRecipeImage({
        uri: asset.uri,
        name: asset.fileName ?? 'recipe.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      });
      setImageUrl(url);
    } catch (err: any) {
      setSubmitError(
        err?.message || 'Unable to upload image. Please try a different photo.',
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!canSubmit) {
      setSubmitError('Please add a title, at least one ingredient, and one step.');
      return;
    }

    const prep = Number(prepMinutes);
    const cook = Number(cookMinutes);
    const servingsNum = Number(servings);

    const invalidIds = new Set<string>();
    const cleanedIngredients = ingredients
      .map((ing) => ({
        ...ing,
        text: ing.text.trim(),
        quantityDisplay: ing.quantityDisplay?.trim() || null,
        unit: ing.unit?.trim() || null,
      }))
      .filter((ing) => {
        const hasAny = ing.text.length > 0 || ing.quantityDisplay || ing.unit;
        if (!hasAny) return false;
        if (!ing.text.length) {
          invalidIds.add(ing.id);
          return false;
        }
        return true;
      });

    setInvalidIngredientIds(invalidIds);

    if (!cleanedIngredients.length) {
      setSubmitError('Add at least one ingredient with a name.');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      prep_time_minutes: Number.isFinite(prep) ? prep : null,
      cook_time_minutes: Number.isFinite(cook) ? cook : null,
      total_time_minutes: totalMinutes ?? null,
      servings: Number.isFinite(servingsNum) ? servingsNum : null,
      source_type: 'manual' as const,
      source_url: null,
      image_url: imageUrl.trim() || null,
      ingredients: cleanedIngredients.map((ing) => ({
        text: ing.text,
        quantity_display: ing.quantityDisplay || undefined,
        unit: ing.unit || undefined,
      })),
      steps: steps
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text, idx) => ({ step_number: idx + 1, text })),
      tags,
      parse_job_id: parseJobId,
    };

    try {
      const recipe = await submitRecipe(payload);
      navigation.replace('RecipeDetail', { id: recipe.id });
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        'Unable to create recipe. Please try again.';
      setSubmitError(Array.isArray(detail) ? detail.join('\n') : detail);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Create Recipe" />
        {parseJobId ? (
          <Appbar.Action
            icon="delete"
            onPress={() =>
              Alert.alert('Discard import?', 'This will remove the imported recipe job.', [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Discard job',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await abandonParseJob(parseJobId);
                      navigation.popToTop();
                    } catch (err: any) {
                      setSubmitError(
                        err?.response?.data?.detail || err?.message || 'Unable to discard job.',
                      );
                    }
                  },
                },
              ])
            }
          />
        ) : null}
      </Appbar.Header>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.container}>
          {parseWarnings?.length ? (
            <HelperText type="info" visible>
              Imported from URL. {parseWarnings.join(' ')}
            </HelperText>
          ) : null}
          <TextInput label="Title" value={title} onChangeText={setTitle} />
          <TextInput
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <View style={styles.row}>
            <TextInput
              style={styles.half}
              label="Prep (min)"
              keyboardType="numeric"
              value={prepMinutes}
              onChangeText={setPrepMinutes}
            />
            <TextInput
              style={styles.half}
              label="Cook (min)"
              keyboardType="numeric"
              value={cookMinutes}
              onChangeText={setCookMinutes}
            />
          </View>
          <Text variant="bodyMedium">
            Total time (computed): {totalMinutes ?? '—'} minutes
          </Text>

          <TextInput
            label="Servings (optional)"
            keyboardType="numeric"
            value={servings}
            onChangeText={setServings}
          />

          <Text variant="titleMedium">Ingredients</Text>
          {!autocompleteAvailable ? (
            <HelperText type="info" visible>
              Autocomplete unavailable while offline. You can still type freely.
            </HelperText>
          ) : null}
          {ingredients.map((ing, index) => {
            const unitSuggestions =
              ing.id === focusedIngredientId &&
              focusedField === 'unit' &&
              ing.unit &&
              ing.unit.length >= 1
                ? searchUnits(ing.unit)
                : [];
            const ingredientSuggestions =
              ing.id === focusedIngredientId &&
              focusedField === 'text' &&
              ing.text &&
              ing.text.length >= 1
                ? searchIngredients(ing.text)
                : [];
            const qtyFilter = (ing.quantityDisplay ?? '').trim().toLowerCase();
            const qtyOptions = presetQty.filter((q) =>
              qtyFilter ? q.toLowerCase().includes(qtyFilter) : true,
            );
            const unitOptions = unitSuggestions.map((u) => u.abbreviation || u.name);

            return (
              <View style={styles.ingredientBlock} key={ing.id}>
                <View style={styles.rowAlign}>
                  <View style={styles.qtyWrapper}>
                    <TextInput
                      placeholder="Qty (e.g. 1/2)"
                      value={ing.quantityDisplay ?? ''}
                      onChangeText={(text) => updateIngredient(ing.id, { quantityDisplay: text })}
                      onFocus={() => {
                        setFocusedIngredientId(ing.id);
                        setFocusedField('qty');
                      }}
                      onBlur={() => {
                        setFocusedField(null);
                        setFocusedIngredientId(null);
                      }}
                      keyboardType="numbers-and-punctuation"
                      ref={(ref: ComponentRef<typeof TextInput> | null) => {
                        qtyRefs.current[ing.id] = ref;
                      }}
                    />
                    {focusedIngredientId === ing.id &&
                    focusedField === 'qty' &&
                    qtyOptions.length ? (
                      <View style={styles.dropdownQty}>
                        {qtyOptions.map((qty) => (
                          <Pressable
                            key={qty}
                            style={styles.dropdownItemRow}
                            onPress={() => {
                              updateIngredient(ing.id, { quantityDisplay: qty });
                              Keyboard.dismiss();
                              setFocusedField('unit');
                              unitRefs.current[ing.id]?.focus?.();
                              setFocusedField(null);
                              setFocusedIngredientId(null);
                            }}
                          >
                            <Text>{qty}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.unitWrapper}>
                    <TextInput
                      placeholder="Unit"
                      value={ing.unit ?? ''}
                      onChangeText={(text) => updateIngredient(ing.id, { unit: text })}
                      onFocus={() => {
                        setFocusedIngredientId(ing.id);
                        setFocusedField('unit');
                      }}
                      onBlur={() => {
                        setFocusedField(null);
                        setFocusedIngredientId(null);
                      }}
                      ref={(ref: ComponentRef<typeof TextInput> | null) => {
                        unitRefs.current[ing.id] = ref;
                      }}
                    />
                    {hasStockData &&
                    focusedIngredientId === ing.id &&
                    focusedField === 'unit' &&
                    unitOptions.length ? (
                      <View style={styles.dropdownUnit}>
                        {unitOptions.map((u) => (
                          <Pressable
                            key={u}
                            style={styles.dropdownItemRow}
                            onPress={() => {
                              updateIngredient(ing.id, {
                                unit: u,
                              });
                              Keyboard.dismiss();
                              setFocusedField(null);
                              setFocusedIngredientId(null);
                            }}
                          >
                            <Text>{u}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  {ingredients.length > 1 && (
                    <IconButton icon="delete" onPress={() => handleRemoveIngredient(ing.id)} />
                  )}
                </View>

                <TextInput
                  placeholder={`Ingredient ${index + 1}`}
                  value={ing.text}
                  onChangeText={(text) => updateIngredient(ing.id, { text })}
                  onFocus={() => {
                    setFocusedIngredientId(ing.id);
                    setFocusedField('text');
                  }}
                  onBlur={() => {
                    setFocusedField(null);
                    setFocusedIngredientId(null);
                  }}
                  autoCapitalize="words"
                  error={invalidIngredientIds.has(ing.id)}
                />
                {hasStockData && ingredientSuggestions.length ? (
                  <View style={styles.suggestions}>
                    {ingredientSuggestions.map((s) => (
                      <Chip
                        key={s.id}
                        compact
                        onPress={() => {
                          updateIngredient(ing.id, { text: s.name });
                          setFocusedField(null);
                          setFocusedIngredientId(null);
                        }}
                      >
                        {s.name}
                      </Chip>
                    ))}
                  </View>
                ) : null}
                {focusedIngredientId === ing.id && focusedField === 'qty' ? (
                  <View style={styles.dropdownQty}>
                    {['1/4', '1/3', '1/2', '3/4', '1', '1 1/2', '2', '3'].map((qty) => (
                      <Pressable
                        key={qty}
                        style={styles.dropdownItemRow}
                        onPress={() => {
                          updateIngredient(ing.id, { quantityDisplay: qty });
                          setFocusedField(null);
                          setFocusedIngredientId(null);
                        }}
                      >
                        <Text>{qty}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          <Button mode="text" onPress={handleAddIngredient} icon="plus">
            Add Ingredient
          </Button>

          <Text variant="titleMedium" style={styles.sectionHeader}>
            Steps
          </Text>
          {steps.map((value, index) => (
            <View style={styles.row} key={`step-${index}`}>
              <TextInput
                style={[styles.flex, styles.stepInput, { height: stepHeights[index] ?? 80 }]}
                placeholder={`Step ${index + 1}`}
                value={value}
                onChangeText={(text) => handleStepChange(text, index)}
                multiline
                textAlignVertical="top"
                onContentSizeChange={(e) => {
                  const h = Math.min(Math.max(80, e.nativeEvent.contentSize.height + 12), 160);
                  setStepHeights((prev) => {
                    const next = [...prev];
                    next[index] = h;
                    return next;
                  });
                }}
              />
              {steps.length > 1 && (
                <IconButton icon="delete" onPress={() => handleRemoveStep(index)} />
              )}
            </View>
          ))}
          <Button mode="text" onPress={handleAddStep} icon="plus">
            Add Step
          </Button>

          <Text variant="titleMedium" style={styles.sectionHeader}>
            Tags
          </Text>
          <View style={styles.row}>
            <TextInput
              style={styles.flex}
              placeholder="Type a tag"
              value={tagInput}
              onChangeText={setTagInput}
            />
            <IconButton icon="plus" onPress={() => handleAddTag()} />
          </View>
          {suggestions.length ? (
            <View style={styles.suggestions}>
              {suggestions.map((s) => (
                <Chip key={s.id} onPress={() => handleAddTag(s.name)} compact>
                  {s.name}
                </Chip>
              ))}
            </View>
          ) : null}
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Chip key={tag} onClose={() => handleRemoveTag(tag)} compact>
                {tag}
              </Chip>
            ))}
          </View>

          <Text variant="titleMedium" style={styles.sectionHeader}>
            Image
          </Text>
          <TextInput
            label="Image URL (optional)"
            value={imageUrl}
            onChangeText={setImageUrl}
            right={<TextInput.Icon icon="link" />}
          />
          <Button
            mode="outlined"
            icon="image"
            onPress={pickImage}
            loading={uploadingImage}
            disabled={uploadingImage}
          >
            Upload from device
          </Button>

          {submitError ? (
            <HelperText type="error" visible>
              {submitError}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={isPending}
            disabled={isPending || !canSubmit}
            style={styles.submit}
          >
            Create Recipe
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  ingredientBlock: {
    gap: 8,
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  half: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  qtyWrapper: {
    width: 140,
    position: 'relative',
  },
  unitWrapper: {
    flex: 1,
    position: 'relative',
  },
  dropdownQty: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: '#f1e8ff',
    borderRadius: 8,
    zIndex: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  dropdownUnit: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: '#f1e8ff',
    borderRadius: 8,
    zIndex: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  dropdownItem: {
    alignItems: 'flex-start',
  },
  dropdownItemContent: {
    justifyContent: 'flex-start',
  },
  dropdownItemRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepInput: {
    minHeight: 80,
    maxHeight: 160,
  },
  sectionHeader: {
    marginTop: 8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  submit: {
    marginTop: 12,
  },
});

export default CreateRecipeScreen;

