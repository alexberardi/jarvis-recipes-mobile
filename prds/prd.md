# PRD: Jarvis Recipes — React Native App (Expo + TypeScript)

You are building the **initial scaffolding** for a new React Native app named `jarvis-recipes`.  
This app will be a **mobile client** for a family recipe and meal-planning system.

---

## 🎯 Goal of Version 1 (MVP)
Provide a clean, navigable UI with **mocked data** where the user can:
- View list of recipes
- Tap to view individual recipe details
- Access planner workflow screens (placeholders)
- View Account/Settings tab
- Have the structure for future:
  - Auth via FastAPI (Jarvis-auth later)
  - Real REST API for recipes + meal plans
  - AI meal plan generation

For now, **NO real backend calls** — fetch from local mocks using React Query.

---

## 📱 Navigation Structure

Use **React Navigation** with a **bottom tab** layout.

Tabs:
1. **RecipesTab**
   - `RecipesListScreen`
   - `RecipeDetailScreen`
2. **PlannerTab**
   - `CreatePlanScreen` (Step 1 placeholder)
   - `PlanReviewScreen` (Step 2 placeholder)
   - `CalendarApplyScreen` (Step 3 placeholder)
   - `WeeklyPlanScreen` (view saved week)
3. **AccountTab**
   - `AccountScreen`
   - `SettingsScreen`

Use **stack navigators** inside each tab.

---

## 🎨 UI Library

Use **React Native Paper** for:
- Buttons
- App bars
- Cards
- Lists
- Inputs
- Theming

Wrap the app in `PaperProvider`.

---

## 🔄 Data Layer

Use **React Query** (`@tanstack/react-query`) for fetching/mutations.

For MVP:
- Mock data in `src/mocks/recipes.json` + `mealPlans.json`
- Mock services in `src/services/mockApi.ts`
  - `getRecipes()`
  - `getRecipeById(id)`
  - `getWeeklyPlan()`
  - return `Promise.resolve(...)` using mocks

Provide wrapper hooks:
- `useRecipes()`
- `useWeeklyPlan()`

Later, these swap to real REST endpoints.

---

## 🧱 Folder Structure

Create:
src/
App.tsx
navigation/
RootNavigator.tsx
RecipesNavigator.tsx
PlannerNavigator.tsx
AccountNavigator.tsx
screens/
Recipes/
RecipesListScreen.tsx
RecipeDetailScreen.tsx
Planner/
CreatePlanScreen.tsx
PlanReviewScreen.tsx
CalendarApplyScreen.tsx
WeeklyPlanScreen.tsx
Account/
AccountScreen.tsx
SettingsScreen.tsx
components/
RecipeCard.tsx
LoadingIndicator.tsx
services/
mockApi.ts
hooks/
useRecipes.ts
useWeeklyPlan.ts
types/
Recipe.ts
MealPlan.ts
theme/
index.ts
mocks/
recipes.json
mealPlans.json
assets/
(sample images)

Also include:
- `App.tsx` bootstrapping:
  - `PaperProvider`
  - `QueryClientProvider`
  - `NavigationContainer`

---

## 👁️ Required Screen Behaviors

### RecipesListScreen
- List recipes using **RecipeCard** component
- Card includes:
  - image
  - title
  - few tags
- Buttons:
  - “Add Recipe” → (placeholder alert for now)
- Tap card → RecipeDetailScreen

### RecipeDetailScreen
- Show image, title, tags
- Ingredients list
- Steps section
- Back button in AppBar

### Planner Screens (placeholders)
- Basic text + buttons to navigate through screens
- Show mocked “weekly plan” list on WeeklyPlanScreen

### Account/Settings Screens
- Placeholder user info
- Basic settings toggles (non-functional yet)

---

## 🧪 Testing Foundation

Add Jest test verifying:
- `RecipesListScreen` renders recipe titles from mock data

---

## 🔐 Future Auth (not in MVP)
Create placeholder files only:
- `src/services/auth.ts`
- `src/hooks/useAuth.ts`

Account tab should show **“Welcome, Family Chef!”** for now.

---

## 📌 Development Principles
- Expo + TypeScript
- Functional components + hooks
- Clean types in `src/types/`
- Modular + minimal boilerplate
- Confirm with user before expanding scope or changing structure
- Keep Add Recipe flow OUTSIDE of this first milestone

---

## 📦 Deliverables for this first pass
When this PRD is implemented, the app should:
1. Build/run via Expo
2. Render bottom-tab navigation
3. List recipes from mocks
4. Show recipe detail screen connected to mock API
5. Display placeholder planner + account screens
6. Use theming + 1–2 reusable components
7. Include README describing mock API + next steps

After delivering these items, **stop and request user review**  
before implementing Add Recipe UI or real API integrations.

---

**End of PRD — Follow exactly**