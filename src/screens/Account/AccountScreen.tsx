import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Appbar, Button, Card, List, Text } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '../../auth/AuthContext';
import { AccountStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AccountStackParamList, 'Account'>;

const AccountScreen = ({ navigation }: Props) => {
  const {
    state: { user },
    logout,
  } = useAuth();

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Account" />
        <Appbar.Action icon="cog" onPress={() => navigation.navigate('Settings')} />
      </Appbar.Header>
      <View style={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.kicker}>
              Welcome, Family Chef!
            </Text>
            <Text variant="headlineSmall">{user?.username || 'Family Chef'}</Text>
            <Text variant="bodyMedium" style={styles.subtle}>
              Manage your account and sign out below.
            </Text>
          </Card.Content>
        </Card>

        <List.Section title="Account">
          <List.Item
            title="Email"
            description={user?.email ?? 'Not set'}
            left={(props) => <List.Icon {...props} icon="email-outline" />}
          />
          {user?.username ? (
            <List.Item
              title="Username"
              description={user.username}
              left={(props) => <List.Icon {...props} icon="account-outline" />}
            />
          ) : null}
        </List.Section>

        <Button mode="contained-tonal" onPress={() => navigation.navigate('Settings')}>
          Open Settings
        </Button>
        <Button mode="outlined" onPress={logout}>
          Logout
        </Button>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 16,
  },
  card: {
    marginBottom: 8,
  },
  kicker: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subtle: {
    marginTop: 6,
  },
});

export default AccountScreen;

