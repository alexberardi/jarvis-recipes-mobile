import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AddRecipeFromUrlScreen from '../screens/Recipes/AddRecipeFromUrlScreen';
import AddRecipeImagesScreen from '../screens/Recipes/AddRecipeImagesScreen';
import AddRecipeModeScreen from '../screens/Recipes/AddRecipeModeScreen';
import CreateRecipeScreen from '../screens/Recipes/CreateRecipeScreen';
import ImportJobStatusScreen from '../screens/Recipes/ImportJobStatusScreen';
import MailboxScreen from '../screens/Recipes/MailboxScreen';
import ParseRecipeStatusScreen from '../screens/Recipes/ParseRecipeStatusScreen';
import RecipeDetailScreen from '../screens/Recipes/RecipeDetailScreen';
import RecipeExtractionProgressScreen from '../screens/Recipes/RecipeExtractionProgressScreen';
import RecipesListScreen from '../screens/Recipes/RecipesListScreen';
import WebViewExtractScreen from '../screens/Recipes/WebViewExtractScreen';
import { RecipesStackParamList } from './types';

const Stack = createNativeStackNavigator<RecipesStackParamList>();

const RecipesNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="RecipesList" component={RecipesListScreen} />
    <Stack.Screen name="AddRecipeMode" component={AddRecipeModeScreen} />
    <Stack.Screen name="AddRecipeFromUrl" component={AddRecipeFromUrlScreen} />
    <Stack.Screen name="AddRecipeFromImages" component={AddRecipeImagesScreen} />
    <Stack.Screen
      name="RecipeExtractionProgress"
      component={RecipeExtractionProgressScreen}
    />
    <Stack.Screen name="ParseRecipeStatus" component={ParseRecipeStatusScreen} />
    <Stack.Screen name="ImportJobStatus" component={ImportJobStatusScreen} />
    <Stack.Screen name="WebViewExtract" component={WebViewExtractScreen} />
    <Stack.Screen name="Mailbox" component={MailboxScreen} />
    <Stack.Screen name="CreateRecipe" component={CreateRecipeScreen} />
    <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
  </Stack.Navigator>
);

export default RecipesNavigator;

