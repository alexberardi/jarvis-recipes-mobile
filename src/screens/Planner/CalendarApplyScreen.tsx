import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Appbar, Button, Card, Text } from 'react-native-paper';
import { ScrollView, StyleSheet } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PlannerStackParamList, 'CalendarApply'>;

const CalendarApplyScreen = ({ navigation }: Props) => (
  <>
    <Appbar.Header>
      <Appbar.BackAction onPress={() => navigation.goBack()} />
      <Appbar.Content title="Apply to Calendar" />
    </Appbar.Header>
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Card.Content>
          <Text variant="titleMedium" style={styles.heading}>
            Step 3: Apply to calendar
          </Text>
          <Text variant="bodyMedium">
            This will sync plans to your family calendar in a future release. For
            now, jump to the weekly plan to preview how meals will display.
          </Text>
        </Card.Content>
      </Card>
      <Button mode="contained" onPress={() => navigation.navigate('WeeklyPlan')}>
        View Weekly Plan
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

export default CalendarApplyScreen;

