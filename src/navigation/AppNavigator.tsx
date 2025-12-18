import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';

import AccountNavigator from './AccountNavigator';
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
      <Tab.Screen
        name="RecipesTab"
        component={RecipesNavigator}
        options={{ title: 'Recipes' }}
      />
      <Tab.Screen
        name="PlannerTab"
        component={PlannerNavigator}
        options={{ title: 'Planner' }}
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

