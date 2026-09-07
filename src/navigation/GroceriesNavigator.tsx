import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ProductPickerScreen from '../screens/Groceries/ProductPickerScreen';
import ShoppingListScreen from '../screens/Groceries/ShoppingListScreen';
import { GroceriesStackParamList } from './types';

const Stack = createNativeStackNavigator<GroceriesStackParamList>();

const GroceriesNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="ShoppingList" component={ShoppingListScreen} />
    <Stack.Screen name="ProductPicker" component={ProductPickerScreen} />
  </Stack.Navigator>
);

export default GroceriesNavigator;
