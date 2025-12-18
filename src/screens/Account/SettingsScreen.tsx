import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Appbar, List, Switch } from 'react-native-paper';
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { AccountStackParamList } from '../../navigation/types';
import { useThemePreference } from '../../theme/ThemeProvider';

type Props = NativeStackScreenProps<AccountStackParamList, 'Settings'>;

const SettingsScreen = ({ navigation }: Props) => {
  const [notifications, setNotifications] = useState(true);
  const { isDark, toggleTheme, themeName } = useThemePreference();

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Settings" />
      </Appbar.Header>
      <View style={styles.container}>
        <List.Section>
          <List.Item
            title="Notifications"
            description="Receive updates about meal plans"
            right={() => (
              <Switch value={notifications} onValueChange={setNotifications} />
            )}
          />
          <List.Item
            title="Dark Mode"
            description="Toggle dark theme"
            right={() => (
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                accessibilityLabel="Toggle dark mode"
              />
            )}
          />
        </List.Section>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});

export default SettingsScreen;

