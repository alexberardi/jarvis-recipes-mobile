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
  Icon,
  List,
  Snackbar,
  Chip,
  Divider,
  HelperText,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import { GroceriesStackParamList } from '../../navigation/types';
import {
  Cart,
  ShoppingItem,
  ShoppingList,
  buildCart,
  formatAmounts,
  getShoppingList,
} from '../../services/grocery';
import { PRESET_LABELS, RangePreset, rangeFor } from './dateRange';
import { useCheckedItems } from './useCheckedItems';
import { Staple, addStaple, getStaples, removeStaple } from '../../services/staples';

type Props = NativeStackScreenProps<GroceriesStackParamList, 'ShoppingList'>;

const PRESETS: RangePreset[] = ['this-week', 'next-week', 'next-7'];

const ShoppingListScreen = ({ navigation }: Props) => {
  const theme = useTheme();
  const [preset, setPreset] = useState<RangePreset>('this-week');
  const { start, end } = rangeFor(preset);

  const [list, setList] = useState<ShoppingList | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [staples, setStaples] = useState<Staple[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { checked, toggle, clear } = useCheckedItems(start, end);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [fetched, itsStaples] = await Promise.all([
        getShoppingList(start, end),
        // Fetched for their ids: the list says WHICH rows are staples, but
        // un-marking one needs the id, which only this endpoint carries. A
        // failure here must not cost the list, so it falls back to none.
        getStaples().catch(() => [] as Staple[]),
      ]);
      setList(fetched);
      setStaples(itsStaples);
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

  const renderRow = (item: ShoppingItem) => {
    const isChecked = Boolean(checked[item.name]);
    const amounts = formatAmounts(item);
    const isStaple = Boolean(item.is_staple);
    return (
      <TouchableRipple
        key={item.name}
        onPress={() => toggle(item.name)}
        // Long-press rather than another visible control: the row already has a
        // tap action and a trash icon, and a third target would crowd a line
        // read while holding a trolley. Discoverability comes from the hint
        // shown under the header while no staples exist yet.
        onLongPress={() => toggleStaple(item.name)}
        delayLongPress={400}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isChecked }}
        accessibilityLabel={amounts ? `${item.name}, ${amounts}` : item.name}
        accessibilityHint={
          isStaple
            ? 'Double tap and hold to stop treating this as a staple'
            : 'Double tap and hold to mark this as a staple you always have'
        }
      >
        <View style={styles.item}>
          <View style={styles.itemText}>
            <Text variant="bodyLarge" style={isChecked ? styles.itemDone : undefined}>
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
          {/* A plain Icon, not an IconButton: the whole row is already the
              pressable and carries the checkbox role, so a nested button would
              add a second overlapping hit target and a second thing for a
              screen reader to land on. The trash still responds because it sits
              inside the row's target. */}
          <View testID={`grocery-remove-${item.name}`}>
            <Icon source="trash-can-outline" size={22} color={theme.colors.onSurfaceVariant} />
          </View>
        </View>
      </TouchableRipple>
    );
  };

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

  // Staples are grouped away rather than hidden, and they do not count towards
  // "N to buy" -- that number is what is left to put in the trolley.
  const items = list?.items ?? [];
  const toShop = items.filter((i) => !i.is_staple);
  const stapleItems = items.filter((i) => i.is_staple);
  const remaining = toShop.filter((i) => !checked[i.name]).length;

  const toggleStaple = async (name: string) => {
    const existing = staples.find((s) => s.name === name);
    try {
      if (existing) {
        await removeStaple(existing.id);
        setNotice(`${name} is back on the list`);
      } else {
        await addStaple(name);
        setNotice(`${name} saved as a staple`);
      }
      // Reload rather than patch local state: is_staple is the server's answer,
      // and a housemate may have changed it too.
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not update your staples.');
    }
  };
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

            {/* Only what is actually being bought. Staples live in their own
                collapsed section below -- present, because a cook needs to know
                the recipe wants salt, but out of the way of the trolley run. */}
            {toShop.map(renderRow)}

            {stapleItems.length === 0 && toShop.length > 0 ? (
              <Text
                variant="bodySmall"
                style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
              >
                Hold an item you always have in to make it a staple.
              </Text>
            ) : null}

            {stapleItems.length > 0 ? (
              // Collapsed by default: the point is to get these out of the way.
              // Hold one again to put it back on the list proper.
              <List.Accordion
                title={`Staples (${stapleItems.length})`}
                titleStyle={{ color: theme.colors.onSurfaceVariant }}
                style={{ backgroundColor: 'transparent', paddingLeft: 0 }}
                testID="staples-section"
              >
                {stapleItems.map(renderRow)}
              </List.Accordion>
            ) : null}

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

      {/* Confirms a long-press landed. Without it the only feedback is a row
          quietly moving into a collapsed section, which reads as the item
          having vanished. */}
      <Snackbar
        visible={notice !== null}
        onDismiss={() => setNotice(null)}
        duration={2500}
      >
        {notice ?? ''}
      </Snackbar>
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
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  // flex so a long ingredient wraps instead of pushing the row off screen.
  itemText: { flex: 1, paddingVertical: 6 },
  itemDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  hint: { marginTop: 8, fontStyle: 'italic' },
  cartSummary: { marginTop: 16, gap: 8 },
  guessHeading: { marginTop: 8 },
  unmatched: { marginTop: 4 },
});

export default ShoppingListScreen;
