import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Appbar, Button, Card, List, Text } from 'react-native-paper';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PlannerStackParamList, 'CreatePlan'>;

const CreatePlanScreen = ({ navigation }: Props) => (
  <>
    <Appbar.Header>
      <Appbar.Content title="Create Plan" />
    </Appbar.Header>
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Card.Content>
          <Text variant="titleMedium" style={styles.heading}>
            Step 1: Choose preferences
          </Text>
          <Text variant="bodyMedium">
            Planner flow is mocked for now. Tap through the steps to preview the
            experience we will flesh out after this milestone.
          </Text>
        </Card.Content>
      </Card>

      <View style={styles.listWrapper}>
        <List.Section title="What this step will do">
          <List.Item
            title="Select meals to include"
            description="Pick recipes from the library (mocked)"
            left={(props) => <List.Icon {...props} icon="check" />}
          />
          <List.Item
            title="Adjust servings"
            description="Family sizing placeholder"
            left={(props) => <List.Icon {...props} icon="check" />}
          />
        </List.Section>
      </View>

      <Button mode="contained" onPress={() => navigation.navigate('PlanReview')}>
        Next: Review
      </Button>
      <Button
        mode="text"
        onPress={() => navigation.navigate('WeeklyPlan')}
        style={styles.secondary}
      >
        Skip to Weekly Plan
      </Button>
    </ScrollView>
  </>
);

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  heading: {
    marginBottom: 6,
  },
  listWrapper: {
    marginTop: 8,
  },
  secondary: {
    alignSelf: 'flex-start',
  },
});

export default CreatePlanScreen;

