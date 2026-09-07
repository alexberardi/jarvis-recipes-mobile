/**
 * The shopping list and the retailer cart built from it.
 *
 * The list is recomputed server-side on every request, never stored -- re-roll
 * Thursday's dinner and the next list is simply right.
 */
import { recipesRequest } from '../api/recipesApi';

export type ShoppingAmount = {
  unit?: string | null;
  quantity?: number | null;
  /** Lines whose quantity could not be parsed, kept verbatim ("to taste"). */
  unparsed: string[];
};

export type ShoppingItem = {
  name: string;
  amounts: ShoppingAmount[];
  /** Which recipes asked for it, so a surprising line can be traced back. */
  recipes: string[];
};

export type ShoppingList = {
  start_date: string;
  end_date: string;
  items: ShoppingItem[];
  /** Zero means nothing is planned in the range -- say so, don't show an empty list. */
  plan_count: number;
};

export type CartItem = {
  ingredient_name: string;
  sku: string;
  quantity: number;
  product_name?: string | null;
  unit_size?: string | null;
  source: string;
};

export type UnmatchedItem = {
  ingredient_name: string;
  /** With the amount, so a product search finds a product and not a noun. */
  amount_display: string;
  recipes: string[];
};

export type Cart = {
  retailer: string;
  /** Null when nothing matched: an empty cart link reads as a broken export. */
  url: string | null;
  items: CartItem[];
  unmatched: UnmatchedItem[];
  match_job_id?: string | null;
};

export type SkuMapping = {
  id: number;
  retailer: string;
  ingredient_name: string;
  sku: string;
  product_name?: string | null;
  unit_size?: string | null;
  source: string;
};

export const getShoppingList = async (
  startDate: string,
  endDate: string,
): Promise<ShoppingList> =>
  recipesRequest<ShoppingList>({
    url: '/shopping-list',
    method: 'GET',
    params: { start_date: startDate, end_date: endDate },
  });

export const buildCart = async (
  startDate: string,
  endDate: string,
  retailer = 'walmart',
): Promise<Cart> =>
  recipesRequest<Cart>({
    url: '/grocery/cart',
    method: 'POST',
    params: { start_date: startDate, end_date: endDate, retailer },
  });

export const getSkuMap = async (retailer = 'walmart'): Promise<SkuMapping[]> =>
  recipesRequest<SkuMapping[]>({
    url: '/grocery/sku-map',
    method: 'GET',
    params: { retailer },
  });

export const saveSkuMapping = async (payload: {
  ingredient_name: string;
  sku: string;
  product_name?: string;
  unit_size?: string;
  retailer?: string;
}): Promise<SkuMapping> =>
  recipesRequest<SkuMapping>({ url: '/grocery/sku-map', method: 'PUT', data: payload });

export const deleteSkuMapping = async (id: number): Promise<void> =>
  recipesRequest<void>({ url: `/grocery/sku-map/${id}`, method: 'DELETE' });

/** One item's amounts as a shopper would read them: "1.5 lb", "2 cups, to taste". */
export const formatAmounts = (item: ShoppingItem): string => {
  const parts: string[] = [];
  for (const amount of item.amounts) {
    if (amount.quantity != null) {
      // Trim the float noise 0.5 + 0.25 leaves behind, without rounding away a
      // genuine 1.75.
      const qty = Number(amount.quantity.toFixed(2)).toString();
      parts.push(amount.unit ? `${qty} ${amount.unit}` : qty);
    }
    parts.push(...amount.unparsed);
  }
  return parts.join(', ');
};
