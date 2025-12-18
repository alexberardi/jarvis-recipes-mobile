import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Appbar, Button, Card, List, Text } from 'react-native-paper';
import { ScrollView, StyleSheet } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PlannerStackParamList, 'PlanReview'>;

const PlanReviewScreen = ({ navigation }: Props) => (
  <>
    <Appbar.Header>
      <Appbar.BackAction onPress={() => navigation.goBack()} />
      <Appbar.Content title="Review Plan" />
    </Appbar.Header>
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Card.Content>
          <Text variant="titleMedium" style={styles.heading}>
            Step 2: Review selections
          </Text>
          <Text variant="bodyMedium">
            In the future this step will summarize your chosen meals, servings,
            and shopping list highlights. For now, continue to apply to the
            calendar.
          </Text>
        </Card.Content>
      </Card>

      <List.Section title="Mocked summary">
        <List.Item title="4 dinners" left={(props) => <List.Icon {...props} icon="silverware" />} />
        <List.Item title="1 leftover night" left={(props) => <List.Icon {...props} icon="clock-outline" />} />
        <List.Item title="Grocery list coming soon" left={(props) => <List.Icon {...props} icon="cart-outline" />} />
      </List.Section>

      <Button mode="contained" onPress={() => navigation.navigate('CalendarApply')}>
        Next: Apply to calendar
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
});

export default PlanReviewScreen;

