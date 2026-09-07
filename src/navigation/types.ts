import { NavigatorScreenParams } from '@react-navigation/native';

export type RecipesStackParamList = {
  RecipesList: undefined;
  // `source` is needed for meal-plan drill-in: the planner stages core recipes,
  // so a slot can point at a stage_recipes UUID rather than a committed recipe.
  // Without it RecipeDetail called /recipes/<uuid> and got a 422 -> "Recipe not
  // found." for a recipe it had just displayed the title of.
  RecipeDetail: { id: number | string; source?: string };
  CreateRecipe: any;
  AddRecipeMode: undefined;
  AddRecipeFromUrl: { initialUrl?: string } | undefined;
  AddRecipeFromImages:
    | { initialImages?: { uri: string; name?: string; type?: string }[]; titleHint?: string }
    | undefined;
  RecipeExtractionProgress: { images: { uri: string; name?: string; type?: string }[]; titleHint?: string };
  ParseRecipeStatus: { jobId: string; url: string };
  ImportJobStatus:
    | { jobId: string; sourceUrl?: string; jobType: 'url' | 'webview' | 'image'; startedAt?: number }
    | undefined;
  WebViewExtract: { url: string; domain?: string };
  Mailbox: undefined;
};

export type PlannerStackParamList = {
  QuickPlan: undefined;
  /** The library of saved plans. */
  MealPlanList: undefined;
  /** One saved plan, read-only. */
  SavedPlan: { planId: number };
  MealPlanDateRange: undefined;
  MealPlanDayConfig: { dates: string[] } | undefined;
  RecipeSearch: {
    date: string;
    meal: string;
    currentPinnedId?: string | null;
  };
  MealPlanProgress: { jobId: string; requestId?: string; startedAt?: number };
  MealPlanResults:
    | {
        jobId: string;
        requestId?: string;
      }
    | undefined;
  // legacy screens kept for compatibility
};

export type AccountStackParamList = {
  Account: undefined;
  Settings: undefined;
};

export type GroceriesStackParamList = {
  ShoppingList: undefined;
  /** Resolve one unmatched ingredient to a retailer product. */
  ProductPicker: {
    ingredientName: string;
    /** The amount, so the search starts from something a shopper would type. */
    amountDisplay: string;
  };
};

export type RootTabParamList = {
  RecipesTab: NavigatorScreenParams<RecipesStackParamList>;
  PlannerTab: NavigatorScreenParams<PlannerStackParamList>;
  GroceriesTab: NavigatorScreenParams<GroceriesStackParamList>;
  AccountTab: NavigatorScreenParams<AccountStackParamList>;
};

export type AuthStackParamList = {
  Landing: undefined;
  Login: undefined;
  Register: undefined;
};

