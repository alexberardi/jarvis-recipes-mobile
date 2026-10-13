import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';

import AccountNavigator from './AccountNavigator';
import GroceriesNavigator from './GroceriesNavigator';
import PlannerNavigator from './PlannerNavigator';
import RecipesNavigator from './RecipesNavigator';
import { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const AppNavigator = () => {
  const theme = useTheme();

  const getIconName = (routeName: keyof RootTabParamList) => {
    switch (routeName) {
      case 'RecipesTab':
        return 'book-open-page-variant';
      case 'PlannerTab':
        return 'calendar-check';
      case 'GroceriesTab':
        return 'cart-outline';
      case 'AccountTab':
      default:
        return 'account-circle';
    }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceDisabled,
        tabBarLabelStyle: { fontSize: 12 },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons
            name={getIconName(route.name)}
            color={color}
            size={size}
          />
        ),
      })}
    >
      {/* Planner first: "what are we eating" is the question this app gets
          opened to answer. Recipes and groceries are what you do BECAUSE of the
          plan, so they follow it. The first tab is also the landing screen, so
          this order decides what you see on launch. */}
      <Tab.Screen
        name="PlannerTab"
        component={PlannerNavigator}
        options={{ title: 'Planner' }}
      />
      <Tab.Screen
        name="RecipesTab"
        component={RecipesNavigator}
        options={{ title: 'Recipes' }}
      />
      <Tab.Screen
        name="GroceriesTab"
        component={GroceriesNavigator}
        options={{ title: 'Groceries' }}
      />
      <Tab.Screen
        name="AccountTab"
        component={AccountNavigator}
        options={{ title: 'Account' }}
      />
    </Tab.Navigator>
  );
};

export default AppNavigator;

