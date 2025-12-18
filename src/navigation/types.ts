import { NavigatorScreenParams } from '@react-navigation/native';

export type RecipesStackParamList = {
  RecipesList: undefined;
  RecipeDetail: { id: number };
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
  MealPlanList: undefined;
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
  CreatePlan: undefined;
  PlanReview: undefined;
  CalendarApply: undefined;
  WeeklyPlan: undefined;
};

export type AccountStackParamList = {
  Account: undefined;
  Settings: undefined;
};

export type RootTabParamList = {
  RecipesTab: NavigatorScreenParams<RecipesStackParamList>;
  PlannerTab: NavigatorScreenParams<PlannerStackParamList>;
  AccountTab: NavigatorScreenParams<AccountStackParamList>;
};

export type AuthStackParamList = {
  Landing: undefined;
  Login: undefined;
  Register: undefined;
};

