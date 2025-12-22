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
  Portal,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import type { TextInput as PaperTextInput } from 'react-native-paper';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createRecipe, updateRecipe, deleteRecipe, uploadRecipeImage, RecipeUpdate } from '../../services/recipes';
import { cancelJob } from '../../services/parseRecipe';
import { useTags } from '../../hooks/useTags';
import { RECIPES_QUERY_KEY, useRecipe } from '../../hooks/useRecipes';
import {
  getStockIngredients,
  getStockUnits,
  searchIngredients,
  searchUnits,
} from '../../services/stockData';
import { NewIngredient, Recipe, RecipeCreate } from '../../types/Recipe';
import { RecipesStackParamList } from '../../navigation/types';
import LoadingIndicator from '../../components/LoadingIndicator';

type Props = NativeStackScreenProps<RecipesStackParamList, 'CreateRecipe'>;

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const CreateRecipeScreen = ({ navigation, route }: Props) => {
  const queryClient = useQueryClient();
  const { data: tagOptions } = useTags();
  const presetQty = ['1/4', '1/3', '1/2', '3/4', '1', '1 1/2', '2', '3'];

  const recipeId = (route.params as any)?.recipeId as number | undefined;
  const initialRecipe = (route.params as any)?.initialRecipe;
  const parseWarnings = (route.params as any)?.parseWarnings as string[] | undefined;
  const parseJobId = (route.params as any)?.parseJobId as string | undefined;
  
  // Load recipe if in edit mode
  const { data: editRecipe, isLoading: loadingRecipe } = useRecipe(recipeId);
  const isEditMode = Boolean(recipeId);
  
  // Use edit recipe data if available, otherwise use initial recipe
  const recipeData = editRecipe || initialRecipe;
  const [title, setTitle] = useState(recipeData?.title ?? '');
  const [description, setDescription] = useState(recipeData?.description ?? '');
  const [prepMinutes, setPrepMinutes] = useState(
    recipeData?.prepMinutes != null ? String(recipeData.prepMinutes) : '',
  );
  const [cookMinutes, setCookMinutes] = useState(
    recipeData?.cookMinutes != null ? String(recipeData.cookMinutes) : '',
  );
  const [servings, setServings] = useState(
    recipeData?.servings != null ? String(recipeData.servings) : '',
  );
  const [ingredients, setIngredients] = useState<NewIngredient[]>(
    recipeData?.ingredients?.length
      ? recipeData.ingredients.map((ing: any, idx: number) => ({
          id: ing.id ? String(ing.id) : `${Date.now()}-${idx}`,
          text: ing.text ?? '',
          quantityDisplay: ing.quantityDisplay ?? ing.quantity_display ?? '',
          unit: ing.unit ?? '',
        }))
      : [{ id: generateId(), text: '', quantityDisplay: '', unit: '' }],
  );
  const [steps, setSteps] = useState<string[]>(
    recipeData?.steps?.length ? recipeData.steps.map((s: any) => s.text || s) : [''],
  );
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(
    recipeData?.tags?.map((t: any) => (typeof t === 'string' ? t : t.name)) ?? [],
  );
  const [imageUrl, setImageUrl] = useState(recipeData?.imageUrl ?? recipeData?.image_url ?? '');
  
  // Update state when recipe loads in edit mode
  useEffect(() => {
    if (editRecipe && isEditMode) {
      setTitle(editRecipe.title);
      setDescription(editRecipe.description ?? '');
      setPrepMinutes(editRecipe.total_time_minutes != null ? String(editRecipe.total_time_minutes) : '');
      setCookMinutes('');
      setServings(editRecipe.servings != null ? String(editRecipe.servings) : '');
      setIngredients(
        editRecipe.ingredients.length
          ? editRecipe.ingredients.map((ing, idx) => ({
              id: String(ing.id),
              text: ing.text,
              quantityDisplay: null,
              unit: null,
            }))
          : [{ id: generateId(), text: '', quantityDisplay: '', unit: '' }],
      );
      setSteps(editRecipe.steps.length ? editRecipe.steps.map((s) => s.text) : ['']);
      setTags(editRecipe.tags.map((t) => t.name));
      setImageUrl(editRecipe.image_url ?? '');
    }
  }, [editRecipe, isEditMode]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
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

  const { mutateAsync: updateRecipeMutation, isPending: isUpdating } = useMutation<
    Recipe,
    Error,
    { id: number; payload: RecipeUpdate }
  >({
    mutationFn: ({ id, payload }) => updateRecipe(id, payload),
    onSuccess: (recipe) => {
      // Invalidate queries to refresh the RecipeDetail screen
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
      // Pop back to the existing RecipeDetail screen, which will refresh automatically
      navigation.goBack();
    },
    onError: (err: any) => {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Unable to update recipe. Please try again.';
      const errorMsg = Array.isArray(message) ? message.join('\n') : message;
      setSnackbarMessage(errorMsg);
      setSnackbarVisible(true);
    },
  });

  const { mutateAsync: deleteRecipeMutation, isPending: isDeleting } = useMutation<
    void,
    Error,
    number
  >({
    mutationFn: deleteRecipe,
    onSuccess: () => {
      // Remove the specific recipe query from cache to prevent refetch
      if (recipeId) {
        queryClient.removeQueries({ queryKey: [...RECIPES_QUERY_KEY, recipeId] });
      }
      // Invalidate the recipes list to refresh it
      queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
      // Navigate back to recipes list
      navigation.reset({
        index: 0,
        routes: [{ name: 'RecipesList' }],
      });
    },
    onError: (err: any) => {
      const message =
        err?.response?.data?.detail || err?.message || 'Unable to delete recipe.';
      const errorMsg = Array.isArray(message) ? message.join('\n') : message;
      setSnackbarMessage(errorMsg);
      setSnackbarVisible(true);
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
      mediaTypes: 'images',
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
      if (isEditMode && recipeId) {
        const updatePayload: RecipeUpdate = {
          title: title.trim(),
          description: description.trim() || null,
          prep_time_minutes: Number.isFinite(prep) ? prep : null,
          cook_time_minutes: Number.isFinite(cook) ? cook : null,
          total_time_minutes: totalMinutes ?? null,
          servings: Number.isFinite(servingsNum) ? servingsNum : null,
          source_type: 'manual',
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
        };
        // updateRecipeMutation handles success/error via onSuccess/onError callbacks
        await updateRecipeMutation({ id: recipeId, payload: updatePayload });
      } else {
        const recipe = await submitRecipe(payload);
        navigation.replace('RecipeDetail', { id: recipe.id });
      }
    } catch (err: any) {
      // Error handling for create mode (update mode errors are handled in mutation onError)
      // But also catch any unexpected errors from update mutation
      if (isEditMode) {
        // If update mutation throws (shouldn't happen, but just in case)
        const message =
          err?.response?.data?.detail ||
          err?.message ||
          'Unable to update recipe. Please try again.';
        const errorMsg = Array.isArray(message) ? message.join('\n') : message;
        setSnackbarMessage(errorMsg);
        setSnackbarVisible(true);
      } else {
        const detail =
          err?.response?.data?.detail ||
          err?.message ||
          'Unable to create recipe. Please try again.';
        setSubmitError(Array.isArray(detail) ? detail.join('\n') : detail);
      }
    }
  };

  const handleDelete = () => {
    if (!recipeId) return;
    Alert.alert('Delete recipe?', 'This will permanently delete this recipe.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // deleteRecipeMutation handles success/error via onSuccess/onError callbacks
          await deleteRecipeMutation(recipeId);
        },
      },
    ]);
  };

  // Show loading indicator while fetching recipe in edit mode
  if (isEditMode && loadingRecipe) {
    return (
      <>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Edit Recipe" />
        </Appbar.Header>
        <LoadingIndicator />
      </>
    );
  }

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={isEditMode ? 'Edit Recipe' : 'Create Recipe'} />
        {isEditMode && recipeId ? (
          <>
            <Appbar.Action
              icon="content-save"
              onPress={handleSubmit}
              disabled={!canSubmit || isUpdating || isDeleting}
              accessibilityLabel="Save recipe"
            />
            <Appbar.Action
              icon="delete"
              onPress={handleDelete}
              disabled={isUpdating || isDeleting}
              accessibilityLabel="Delete recipe"
            />
          </>
        ) : parseJobId ? (
          <Appbar.Action
            icon="delete"
            onPress={() =>
              Alert.alert('Cancel import?', 'This will cancel the recipe import job.', [
                { text: 'Keep', style: 'cancel' },
                {
                  text: 'Cancel',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await cancelJob(parseJobId);
                      // Navigate back to RecipesList
                      navigation.reset({
                        index: 0,
                        routes: [{ name: 'RecipesList' }],
                      });
                    } catch (err: any) {
                      setSubmitError(
                        err?.response?.data?.detail || err?.message || 'Unable to cancel job.',
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

          {!isEditMode && (
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={isPending}
              disabled={isPending || !canSubmit}
              style={styles.submit}
            >
              Create Recipe
            </Button>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {(isUpdating || isDeleting) && (
        <View style={styles.loadingOverlay}>
          <LoadingIndicator />
        </View>
      )}
      <Portal>
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={4000}
          action={{
            label: 'Dismiss',
            onPress: () => setSnackbarVisible(false),
          }}
        >
          {snackbarMessage}
        </Snackbar>
      </Portal>
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  snackbar: {
    zIndex: 2000,
  },
});

export default CreateRecipeScreen;

