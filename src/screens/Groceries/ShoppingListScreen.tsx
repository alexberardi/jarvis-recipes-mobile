/**
 * The shopping list, and the cart export built from it.
 *
 * The list is recomputed server-side for whatever range is selected -- never
 * stored -- so re-rolling Thursday's dinner and coming back here simply shows
 * the right thing.
 */
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Checkbox,
  Chip,
  Divider,
  HelperText,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import { GroceriesStackParamList } from '../../navigation/types';
import { Cart, ShoppingList, buildCart, formatAmounts, getShoppingList } from '../../services/grocery';
import { PRESET_LABELS, RangePreset, rangeFor } from './dateRange';
import { useCheckedItems } from './useCheckedItems';

type Props = NativeStackScreenProps<GroceriesStackParamList, 'ShoppingList'>;

const PRESETS: RangePreset[] = ['this-week', 'next-week', 'next-7'];

const ShoppingListScreen = ({ navigation }: Props) => {
  const theme = useTheme();
  const [preset, setPreset] = useState<RangePreset>('this-week');
  const { start, end } = rangeFor(preset);

  const [list, setList] = useState<ShoppingList | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { checked, toggle, clear } = useCheckedItems(start, end);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await getShoppingList(start, end));
      // The previous range's cart is meaningless here, and leaving the export
      // button showing a stale link is worse than showing none.
      setCart(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not build your list.');
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  // On focus: the plan this list is computed from is committed on another tab.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const exportCart = async () => {
    setExporting(true);
    setError(null);
    try {
      const built = await buildCart(start, end);
      setCart(built);
      if (built.url) await Linking.openURL(built.url);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not build the cart.');
    } finally {
      setExporting(false);
    }
  };

  const remaining = (list?.items ?? []).filter((i) => !checked[i.name]).length;
  const guessed = (cart?.items ?? []).filter((i) => i.source === 'llm');

  return (
    <>
      <Appbar.Header>
        <Appbar.Content
          title="Groceries"
          subtitle={list ? `${start} – ${end}` : undefined}
        />
        {list?.items.length ? (
          <Appbar.Action
            icon="checkbox-multiple-blank-outline"
            onPress={clear}
            accessibilityLabel="Clear ticks"
          />
        ) : null}
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        <View style={styles.chips}>
          {PRESETS.map((p) => (
            <Chip
              key={p}
              selected={preset === p}
              mode={preset === p ? 'flat' : 'outlined'}
              onPress={() => setPreset(p)}
            >
              {PRESET_LABELS[p]}
            </Chip>
          ))}
        </View>

        {error ? (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        ) : null}

        {loading ? (
          <ActivityIndicator style={styles.spacer} />
        ) : !list?.plan_count ? (
          // Distinct from "the list is empty": nothing is PLANNED, so the fix is
          // to plan something, not to wonder why the list came back blank.
          <View style={styles.empty}>
            <Text variant="bodyLarge">Nothing planned for these days.</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Save a meal plan covering this range and its ingredients will appear here.
            </Text>
            <Button
              mode="contained"
              style={styles.spacer}
              onPress={() => navigation.getParent()?.navigate('PlannerTab')}
            >
              Plan the week
            </Button>
          </View>
        ) : (
          <>
            <View style={styles.listHeader}>
              <Text variant="titleMedium" style={styles.listTitle}>
                {remaining} to buy
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {list.plan_count} plan{list.plan_count === 1 ? '' : 's'}
              </Text>
            </View>

            {/* A hand-built row rather than Checkbox.Item: that takes a single
                label, and an amount crammed into it truncates -- a list that
                says "chicken breast" without "1.5 lb" is not a shopping list.
                It also marks its label subtree no-hide-descendants, which puts
                the text out of reach of anything reading the screen. */}
            {list.items.map((item) => {
              const isChecked = Boolean(checked[item.name]);
              const amounts = formatAmounts(item);
              return (
                <TouchableRipple
                  key={item.name}
                  onPress={() => toggle(item.name)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={amounts ? `${item.name}, ${amounts}` : item.name}
                >
                  <View style={styles.item}>
                    <Checkbox status={isChecked ? 'checked' : 'unchecked'} />
                    <View style={styles.itemText}>
                      <Text
                        variant="bodyLarge"
                        style={isChecked ? styles.itemDone : undefined}
                      >
                        {item.name}
                      </Text>
                      {amounts ? (
                        <Text
                          variant="bodySmall"
                          style={[
                            { color: theme.colors.onSurfaceVariant },
                            isChecked ? styles.itemDone : undefined,
                          ]}
                        >
                          {amounts}
                          {item.recipes.length ? ` · ${item.recipes.join(', ')}` : ''}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableRipple>
              );
            })}

            <Divider style={styles.spacer} />
            <Button
              mode="contained"
              icon="cart-outline"
              onPress={exportCart}
              loading={exporting}
              disabled={exporting}
            >
              Send to Walmart
            </Button>

            {cart ? (
              <View style={styles.cartSummary}>
                <Text variant="bodyMedium">
                  {cart.items.length} item{cart.items.length === 1 ? '' : 's'} sent to your cart
                  {cart.url ? '.' : ' — nothing matched yet.'}
                </Text>
                {/* Guessed matches are shown for confirmation rather than
                    slipped into the cart silently. The background pass is a
                    small local model and it does get these wrong -- it matched
                    "ground chicken" to a chicken BREAST product in testing.
                    Nothing is blocked on confirming: the item is already in the
                    cart, and this is the one place a wrong guess is visible
                    before the checkout is. */}
                {guessed.length ? (
                  <>
                    <Text variant="labelLarge" style={styles.guessHeading}>
                      Check these — we guessed
                    </Text>
                    {guessed.map((guess) => (
                      <Button
                        key={guess.ingredient_name}
                        mode="outlined"
                        icon="help-circle-outline"
                        style={styles.unmatched}
                        accessibilityLabel={`Fix the product for ${guess.ingredient_name}`}
                        onPress={() =>
                          navigation.navigate('ProductPicker', {
                            ingredientName: guess.ingredient_name,
                            amountDisplay: '',
                          })
                        }
                      >
                        {guess.ingredient_name} → {guess.product_name ?? guess.sku}
                      </Button>
                    ))}
                  </>
                ) : null}

                {cart.unmatched.length ? (
                  <>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Pick a product for these once, and they will go in the cart
                      automatically from now on:
                    </Text>
                    {cart.unmatched.map((item) => (
                      <Button
                        key={item.ingredient_name}
                        mode="outlined"
                        style={styles.unmatched}
                        icon="magnify"
                        accessibilityLabel={`Pick a product for ${item.ingredient_name}`}
                        onPress={() =>
                          navigation.navigate('ProductPicker', {
                            ingredientName: item.ingredient_name,
                            amountDisplay: item.amount_display,
                          })
                        }
                      >
                        {item.ingredient_name}
                      </Button>
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spacer: { marginTop: 16 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  // flexShrink 0: without it the count on the right squeezes "12 to buy" down to
  // "12", the same way "Your week" became "Your".
  listTitle: { flexShrink: 0 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 },
  // flex so a long ingredient wraps instead of pushing the row off screen.
  itemText: { flex: 1, paddingVertical: 6 },
  itemDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  cartSummary: { marginTop: 16, gap: 8 },
  guessHeading: { marginTop: 8 },
  unmatched: { marginTop: 4 },
});

export default ShoppingListScreen;
