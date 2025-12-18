# Jarvis Recipes (Expo + TypeScript)

Mobile app for family recipes and meal planning with URL/image import, AI-powered meal plan generation, and recipe management.

## Getting Started

### Development Setup

```bash
# Install dependencies
npm install

# Create .env file for local development
cp env.template .env
# Edit .env to point to your local API servers

# Start Expo dev server
npm start

# Or run directly on iOS simulator
npm run dev:ios
```

### Environment Variables

Create a `.env` file in the project root:

```bash
EXPO_PUBLIC_AUTH_API_BASE_URL=http://localhost:8007
EXPO_PUBLIC_RECIPES_API_BASE_URL=http://localhost:8001
```

## Tech
- Expo SDK 54, React Native 0.81, React 19
- React Navigation 7 (bottom tabs + native stacks)
- React Native Paper (UI + theming)
- React Query 5 (mocked data fetches)
- Jest + Testing Library (baseline test)

## Features

### Recipe Management
- **Add recipes via URL**: Paste recipe URL, AI extracts ingredients/steps
- **Add recipes from images**: Take photos of recipe cards, OCR + AI extraction
- **Manual entry**: Traditional form-based recipe creation
- **Browse & search**: View all recipes with filtering and search
- **Tag management**: Organize recipes with custom tags

### Meal Planning
- **AI-powered generation**: Select dates, preferences, and generate meal plans
- **Recipe alternatives**: View 2-3 alternative recipes per meal slot with swap functionality
- **Confidence scoring**: See match quality for each suggested recipe
- **Pin specific recipes**: Lock in favorite recipes for specific meal slots
- **Customizable preferences**: Set dietary restrictions, cuisine preferences, prep time limits

### Authentication
- JWT-based authentication with token refresh
- Secure session management
- Protected routes and API calls

## Project Structure
- `App.tsx`: Providers (Paper, React Query, Navigation, Auth)
- `src/navigation`: Root tabs + per-tab stacks (Recipes, Planner, Account)
- `src/screens`: 
  - **Recipes**: List, detail, create/edit, import (URL/image/WebView)
  - **Planner**: Date selection, day configuration, meal plan generation & results
  - **Account**: Profile, settings, auth screens
- `src/components`: `RecipeCard`, `AppLogo`, `LoadingIndicator`, form components
- `src/services`: API clients for recipes, meal plans, auth, stock data, tags
- `src/hooks`: `useRecipes`, `useMealPlans`, `useAuth`, `useTags`
- `src/types`: Recipe, meal plan, user, and auth models
- `assets`: App logo variants (light/dark mode)

## Testing
```bash
npm test
```

## Deployment

### TestFlight (iOS)

See comprehensive guides:
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Full deployment guide with setup instructions
- **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** - Quick reference for common commands

#### Quick Start

```bash
# Install EAS CLI
npm install -g eas-cli

# Login and initialize
eas login
eas init

# Build for preview (staging)
eas build --platform ios --profile preview

# Build for production (TestFlight)
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios --latest
```

#### Automated Deployment

GitHub Actions automatically:
- Builds **preview** on push to `staging` branch
- Builds **production** and submits to TestFlight on push to `main` branch

See [.github/workflows/build-and-deploy.yml](.github/workflows/build-and-deploy.yml) for details.

## API Integration

This app connects to two backend services:
- **Auth API** (`jarvis-auth-server`): User authentication and session management
- **Recipes API** (`jarvis-recipes-server`): Recipe CRUD, meal plan generation, URL/image parsing

API base URLs are configured via environment variables (see setup above).

# jarvis-recipes-mobile
