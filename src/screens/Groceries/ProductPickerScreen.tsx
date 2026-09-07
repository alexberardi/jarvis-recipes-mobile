/**
 * Resolve one ingredient to a Walmart product, once.
 *
 * Walmart has no public product search API on this plan, so the honest way to
 * let someone say "this is the beef we buy" is their own site: search, open the
 * product, and read the item id out of the URL. No credentials are asked for and
 * none are handled -- the WebView is Walmart's own page, and the only thing
 * taken from it is the numeric id in the address bar.
 *
 * Saving is manual and explicit. Auto-saving whatever product happened to be on
 * screen would map an ingredient to a page someone merely scrolled past.
 */
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { WebView, WebViewNavigation } from 'react-native-webview';

import { GroceriesStackParamList } from '../../navigation/types';
import { saveSkuMapping } from '../../services/grocery';

type Props = NativeStackScreenProps<GroceriesStackParamList, 'ProductPicker'>;

/**
 * Walmart product URLs are /ip/<slug>/<itemId>, sometimes with a query string.
 * The id is the last path segment and is always numeric, which is what makes it
 * safe to pull out: a slug can contain anything, digits at the end of a path
 * cannot be mistaken for one.
 */
const ITEM_ID = /walmart\.com\/ip\/(?:[^/]+\/)?(\d{4,})/i;

export const extractItemId = (url: string): string | null => {
  const match = url.match(ITEM_ID);
  return match ? match[1] : null;
};

const searchUrl = (query: string) =>
  `https://www.walmart.com/search?q=${encodeURIComponent(query)}`;

const ProductPickerScreen = ({ navigation, route }: Props) => {
  const { ingredientName, amountDisplay } = route.params;
  const theme = useTheme();
  const webRef = useRef<WebView>(null);

  const [sku, setSku] = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [unitSize, setUnitSize] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onNavigate = (nav: WebViewNavigation) => {
    const id = extractItemId(nav.url);
    // Only ever set, never cleared on navigation: browsing back to the search
    // results after opening a product should not discard the id just found.
    if (id) {
      setSku(id);
      if (!productName && nav.title) {
        // Walmart's titles trail " - Walmart.com"; the product name is the part
        // before it.
        setProductName(nav.title.replace(/\s*[-|]\s*Walmart\.com.*$/i, '').trim());
      }
    }
  };

  const save = async () => {
    if (!sku) return;
    setSaving(true);
    setError(null);
    try {
      await saveSkuMapping({
        ingredient_name: ingredientName,
        sku,
        product_name: productName.trim() || undefined,
        unit_size: unitSize.trim() || undefined,
      });
      navigation.goBack();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not save that product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={ingredientName} subtitle={amountDisplay || undefined} />
      </Appbar.Header>

      <View style={styles.hint}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {sku
            ? 'Found a product. Check the size below, then save it.'
            : 'Find the product you buy and open it — the item id is read from the address.'}
        </Text>
      </View>

      <WebView
        ref={webRef}
        source={{ uri: searchUrl(amountDisplay ? `${amountDisplay} ${ingredientName}` : ingredientName) }}
        onNavigationStateChange={onNavigate}
        style={styles.web}
      />

      {sku ? (
        <View style={styles.form}>
          <TextInput
            label="Product"
            value={productName}
            onChangeText={setProductName}
            dense
          />
          <TextInput
            // The package size is what makes "3 lb of beef" buy three packets
            // instead of one. Optional: without it the cart gets a quantity of 1,
            // which is a sane default and not a wrong one.
            label="Package size (e.g. 1 lb)"
            value={unitSize}
            onChangeText={setUnitSize}
            dense
          />
          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}
          <Button mode="contained" onPress={save} loading={saving} disabled={saving}>
            Save as “{ingredientName}”
          </Button>
        </View>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  hint: { paddingHorizontal: 16, paddingBottom: 8 },
  web: { flex: 1 },
  form: { padding: 16, gap: 8 },
});

export default ProductPickerScreen;
