# Create Recipe Revamp — Ingredients & Units (Mobile)

This PRD describes the changes needed in **jarvis-recipes-mobile** (React Native / Expo, TypeScript) to:

1. Support the new ingredient structure on the server:
   - `text` (required)
   - `quantity_display` (optional string)
   - `unit` (optional string)
2. Add a richer **Create Recipe** UX with:
   - Quantity (free-form, fraction-friendly)
   - Unit of measure (UoM) with autocomplete
   - Ingredient name with autocomplete
3. **Preload and cache** stock ingredients and stock units of measure from the server so that search runs **locally**, not per-keystroke over the network.

The server-side behavior and data sources are defined in `jarvis-recipes-server/PRDs/ingredients.md`.

---

## 1. Data Model & API Contracts (Client View)

### 1.1 Ingredient Shape (Client Side)

```ts
export type NewIngredient = {
  id: string; // client-side UUID for list rendering
  text: string; // required: ingredient name / description
  quantityDisplay?: string | null; // optional: "1/2", "1 1/2", "2", "0.5"
  unit?: string | null; // optional: e.g. "tbsp", "cup"
};
```

### 1.2 Server Payload Mapping

```jsonc
{
  "text": "cumin",
  "quantity_display": "1 1/2",
  "unit": "tbsp"
}
```

Mapping rules:
- `text` → `text`
- `quantityDisplay` → `quantity_display`
- `unit` → `unit`

---

## 2. Stock Data: Ingredients & Units

### 2.1 Types

```ts
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
```

### 2.2 Source Endpoints

- `GET /ingredients/stock`
- `GET /units/stock`

We will fetch **full static lists** using:

```
GET /ingredients/stock?q=&limit=2000
GET /units/stock?q=&limit=200
```

### 2.3 Caching Strategy

- Cache response results in AsyncStorage
- Load immediately from cache on startup
- Use cached values for local autocomplete

#### 2.3.1 Storage

Keys:
- `stock_ingredients_v1`
- `stock_units_v1`
- `stock_last_fetched_v1` (timestamp)

#### 2.3.2 Refresh Policy

- On first run / when no cache is present:
  - Fetch from server, save to AsyncStorage
  - Save current timestamp as `lastFetched`

- On subsequent runs:
  - Load cached lists immediately
  - If `lastFetched` > 30 minutes old:
    - Trigger background refresh

- Background refresh:
  - If success → update in-memory + AsyncStorage + timestamp
  - If failure → silently keep cached data

- If fetch fails & no cache exists:
  - Allow free‑form data only (no autocomplete)
  - Optional toast: "Autocomplete unavailable while offline"

### 2.4 Local Search Behavior

- Runs entirely on cached arrays
- Case‑insensitive substring match

**Ingredients:** search in `name` + `synonyms`

**Units:** search in `name` + `abbreviation`

Limit results (10–20)

---

## 3. UI/UX Changes — Create Recipe

### 3.1 Current Behavior

- Single text input per ingredient
- Not structured

### 3.2 New Ingredient Row Layout

Inputs per row:
1. Quantity (free text)
2. Unit (autocomplete)
3. Ingredient name (autocomplete — required)

### 3.3 Autocomplete

- Suggestions shown after 1–2 characters
- Tap to populate field
- Always allow ignoring suggestions

### 3.4 Row Management

- "Add Ingredient" → adds row
- Trash icon → removes row
- Use stable `id` for row keys

### 3.5 Validation

- At least one non‑empty ingredient `text`
- Clean out fully empty rows

---

## 4. Error Handling & Offline Behavior

- If stock data unavailable → fallback to free‑form
- Show minimal/non‑blocking messages
- Continue using cached data whenever possible

---

## 5. Implementation Plan

1️⃣ Add stock data service
- Fetch, cache, search helpers

2️⃣ Update Create Recipe screen
- Use `NewIngredient[]` state
- Add structured inputs and autocomplete

3️⃣ API mapping
- Transform ingredients list to server payload

4️⃣ QA
- Offline first run
- Offline after cache
- Autocomplete correctness
- Input robustness

--- END NEW CONTENT ---
