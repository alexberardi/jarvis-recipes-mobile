import AsyncStorage from '@react-native-async-storage/async-storage';

import { recipesRequest } from '../api/recipesApi';

export type StockIngredient = {
  id: number;
  name: string;
  category?: string | null;
  synonyms?: string[];
};

export type StockUnit = {
  id: number;
  name: string;
  abbreviation: string | null;
};

const ING_KEY = 'stock_ingredients_v1';
const UNIT_KEY = 'stock_units_v1';
const FETCHED_KEY = 'stock_last_fetched_v1';
const STALE_MS = 30 * 60 * 1000;

let ingredientsCache: StockIngredient[] = [];
let unitsCache: StockUnit[] = [];
let lastFetched = 0;
let refreshPromise: Promise<void> | null = null;
let cacheLoaded = false;

const loadCache = async () => {
  if (cacheLoaded) return;
  try {
    const [ingredientsRaw, unitsRaw, fetchedRaw] = await AsyncStorage.multiGet([
      ING_KEY,
      UNIT_KEY,
      FETCHED_KEY,
    ]);
    ingredientsCache = ingredientsRaw[1] ? JSON.parse(ingredientsRaw[1]) : [];
    unitsCache = unitsRaw[1] ? JSON.parse(unitsRaw[1]) : [];
    lastFetched = fetchedRaw[1] ? Number(fetchedRaw[1]) || 0 : 0;
  } catch (error) {
    console.warn('[stockData] Failed to load cache:', error instanceof Error ? error.message : String(error));
    ingredientsCache = [];
    unitsCache = [];
    lastFetched = 0;
  } finally {
    cacheLoaded = true;
  }
};

const saveCache = async () => {
  try {
    await AsyncStorage.multiSet([
      [ING_KEY, JSON.stringify(ingredientsCache)],
      [UNIT_KEY, JSON.stringify(unitsCache)],
      [FETCHED_KEY, String(lastFetched)],
    ]);
  } catch (error) {
    console.warn('[stockData] Failed to save cache:', error instanceof Error ? error.message : String(error));
  }
};

const fetchStock = async () => {
  const [ingredientsRes, unitsRes] = await Promise.all([
    recipesRequest<StockIngredient[]>({
      url: '/ingredients/stock',
      method: 'GET',
      params: { q: '', limit: 1000 },
    }),
    recipesRequest<StockUnit[]>({
      url: '/units/stock',
      method: 'GET',
      params: { q: '', limit: 100 },
    }),
  ]);
  ingredientsCache = ingredientsRes ?? [];
  unitsCache = unitsRes ?? [];
  lastFetched = Date.now();
  await saveCache();
};

const ensureFreshness = async () => {
  await loadCache();
  const stale = Date.now() - lastFetched > STALE_MS;
  if (!refreshPromise && (stale || !ingredientsCache.length || !unitsCache.length)) {
    refreshPromise = fetchStock().catch(() => {
      // keep cache
    }).finally(() => {
      refreshPromise = null;
    });
    if (!ingredientsCache.length || !unitsCache.length) {
      await refreshPromise;
    }
  }
};

export const getStockIngredients = async (): Promise<StockIngredient[]> => {
  await ensureFreshness();
  return ingredientsCache;
};

export const getStockUnits = async (): Promise<StockUnit[]> => {
  await ensureFreshness();
  return unitsCache;
};

export const searchIngredients = (query: string, limit = 12): StockIngredient[] => {
  const q = query.trim().toLowerCase();
  if (!q || !ingredientsCache.length) return [];
  const results: StockIngredient[] = [];
  for (const item of ingredientsCache) {
    const haystack = [
      item.name.toLowerCase(),
      ...(item.synonyms?.map((s) => s.toLowerCase()) ?? []),
    ];
    if (haystack.some((h) => h.includes(q))) {
      results.push(item);
      if (results.length >= limit) break;
    }
  }
  return results;
};

export const searchUnits = (query: string, limit = 12): StockUnit[] => {
  const q = query.trim().toLowerCase();
  if (!q || !unitsCache.length) return [];
  const results: StockUnit[] = [];
  for (const item of unitsCache) {
    const haystack = [
      item.name.toLowerCase(),
      ...(item.abbreviation ? [item.abbreviation.toLowerCase()] : []),
    ];
    if (haystack.some((h) => h.includes(q))) {
      results.push(item);
      if (results.length >= limit) break;
    }
  }
  return results;
};

