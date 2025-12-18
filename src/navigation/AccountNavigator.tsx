import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AccountScreen from '../screens/Account/AccountScreen';
import SettingsScreen from '../screens/Account/SettingsScreen';
import { AccountStackParamList } from './types';

const Stack = createNativeStackNavigator<AccountStackParamList>();

const AccountNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Account" component={AccountScreen} />
    <Stack.Screen name="Settings" component={SettingsScreen} />
  </Stack.Navigator>
);

export default AccountNavigator;

