import { createNativeStackNavigator } from '@react-navigation/native-stack';

import CalendarApplyScreen from '../screens/Planner/CalendarApplyScreen';
import CreatePlanScreen from '../screens/Planner/CreatePlanScreen';
import MealPlanDateRangeScreen from '../screens/Planner/MealPlanDateRangeScreen';
import MealPlanDayConfigScreen from '../screens/Planner/MealPlanDayConfigScreen';
import MealPlanListScreen from '../screens/Planner/MealPlanListScreen';
import MealPlanProgressScreen from '../screens/Planner/MealPlanProgressScreen';
import MealPlanResultsScreen from '../screens/Planner/MealPlanResultsScreen';
import PlanReviewScreen from '../screens/Planner/PlanReviewScreen';
import RecipeSearchScreen from '../screens/Planner/RecipeSearchScreen';
import WeeklyPlanScreen from '../screens/Planner/WeeklyPlanScreen';
import { PlannerStackParamList } from './types';

const Stack = createNativeStackNavigator<PlannerStackParamList>();

const PlannerNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="MealPlanList">
    <Stack.Screen name="MealPlanList" component={MealPlanListScreen} />
    <Stack.Screen name="MealPlanDateRange" component={MealPlanDateRangeScreen} />
    <Stack.Screen name="MealPlanDayConfig" component={MealPlanDayConfigScreen} />
    <Stack.Screen name="RecipeSearch" component={RecipeSearchScreen} />
    <Stack.Screen name="MealPlanProgress" component={MealPlanProgressScreen} />
    <Stack.Screen name="MealPlanResults" component={MealPlanResultsScreen} />
    <Stack.Screen name="CreatePlan" component={CreatePlanScreen} />
    <Stack.Screen name="PlanReview" component={PlanReviewScreen} />
    <Stack.Screen name="CalendarApply" component={CalendarApplyScreen} />
    <Stack.Screen name="WeeklyPlan" component={WeeklyPlanScreen} />
  </Stack.Navigator>
);

export default PlannerNavigator;

