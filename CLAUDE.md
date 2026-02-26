# jarvis-recipes-mobile

Expo/React Native mobile app for recipe management, URL/image import, and AI-powered meal planning.

## Quick Reference

```bash
# Install
npm install

# Development
cp env.template .env     # Configure API URLs
npm start                # Expo dev server
npm run dev:ios          # Open simulator + run
npm run ios              # iOS simulator
npm run android          # Android emulator

# Tests
npm test
npm run test:coverage
```

## Architecture

```
jarvis-recipes-mobile/
├── App.tsx                # Root (Auth + Query + Navigation + Theme providers)
├── src/
│   ├── auth/              # JWT auth, token refresh, secure storage
│   ├── screens/
│   │   ├── Recipes/       # List, detail, create/edit, URL/image import
│   │   ├── Planner/       # Meal planning (date, preferences, AI generation)
│   │   └── Account/       # Profile, settings, logout
│   ├── navigation/        # Root tabs + per-tab stacks (9 navigation files)
│   ├── services/
│   │   ├── auth.ts              # Auth API client
│   │   ├── recipes.ts           # Recipe CRUD
│   │   ├── mealPlans.ts         # Meal plan API
│   │   ├── recipeIngestion.ts   # URL/image recipe import
│   │   ├── parseRecipe.ts       # Recipe parsing endpoint
│   │   ├── stockData.ts         # Ingredient stock
│   │   ├── tags.ts              # Recipe tags
│   │   ├── webviewExtraction.ts # WebView-based extraction
│   │   └── jobPolling.ts        # Async job polling
│   ├── hooks/             # useRecipes, useMealPlans, etc.
│   ├── types/             # TypeScript models (Recipe, MealPlan, User)
│   ├── components/        # RecipeCard, AppLogo, forms
│   ├── theme/             # Light/dark mode
│   ├── mocks/             # Development mock data
│   └── config/            # API URL configuration
├── __tests__/             # Jest test suite
├── DEPLOYMENT.md          # Detailed deployment guide
└── ios/                   # Xcode project
```

## Tech Stack

- **Expo 54** + React Native 0.81 + React 19 + TypeScript
- **React Navigation 7** (bottom tabs + native stacks)
- **React Native Paper** (Material Design UI)
- **React Query 5** (data fetching, caching)
- **expo-image-picker** (camera/gallery for recipe images)
- **react-native-webview** (URL extraction fallback)

## Key Features

- **Recipe Import**: Add recipes from URLs (AI extraction) or photos (OCR)
- **Manual Entry**: Full recipe editor
- **Meal Planning**: AI-powered plan generation from preferences + date range
- **Browse & Search**: Filter by tags, search by name
- **Async Processing**: Job polling for URL/image parsing

## Environment

Create `.env` from `env.template`:
```bash
EXPO_PUBLIC_AUTH_API_BASE_URL=http://localhost:7701
EXPO_PUBLIC_RECIPES_API_BASE_URL=http://localhost:7030
```

## Deployment

- **EAS Build** with profiles: development, preview, production
- **GitHub Actions CI/CD**:
  - `staging` branch → preview build for TestFlight
  - `main` branch → production build + TestFlight submission
- See `DEPLOYMENT.md` for full guide

## Dependencies

**Service Dependencies:**
- `jarvis-auth` (7701) — login, signup, token refresh
- `jarvis-recipes-server` (7030) — all recipe/meal plan operations
