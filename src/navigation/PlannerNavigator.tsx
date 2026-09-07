import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MealPlanDateRangeScreen from '../screens/Planner/MealPlanDateRangeScreen';
import QuickPlanScreen from '../screens/Planner/QuickPlanScreen';
import MealPlanDayConfigScreen from '../screens/Planner/MealPlanDayConfigScreen';
import MealPlanListScreen from '../screens/Planner/MealPlanListScreen';
import MealPlanProgressScreen from '../screens/Planner/MealPlanProgressScreen';
import MealPlanResultsScreen from '../screens/Planner/MealPlanResultsScreen';
import RecipeSearchScreen from '../screens/Planner/RecipeSearchScreen';
import SavedPlanScreen from '../screens/Planner/SavedPlanScreen';
import { PlannerStackParamList } from './types';

const Stack = createNativeStackNavigator<PlannerStackParamList>();

const PlannerNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="QuickPlan">
    {/* Default: instant random plan with per-meal re-roll. */}
    <Stack.Screen name="QuickPlan" component={QuickPlanScreen} />
    {/* Saved plans, reached from the list icon. */}
    <Stack.Screen name="MealPlanList" component={MealPlanListScreen} />
    <Stack.Screen name="SavedPlan" component={SavedPlanScreen} />
    {/* Advanced: the LLM planner, reached from the tune icon. */}
    <Stack.Screen name="MealPlanDateRange" component={MealPlanDateRangeScreen} />
    <Stack.Screen name="MealPlanDayConfig" component={MealPlanDayConfigScreen} />
    <Stack.Screen name="RecipeSearch" component={RecipeSearchScreen} />
    <Stack.Screen name="MealPlanProgress" component={MealPlanProgressScreen} />
    <Stack.Screen name="MealPlanResults" component={MealPlanResultsScreen} />
  </Stack.Navigator>
);

export default PlannerNavigator;

