import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Appbar, Button, Text } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';
import { loadMealPlanJob } from '../../services/mealPlans';
import { useEffect } from 'react';

type Props = NativeStackScreenProps<PlannerStackParamList, 'MealPlanList'>;

const MealPlanListScreen = ({ navigation }: Props) => {
  useEffect(() => {
    const resume = async () => {
      const active = await loadMealPlanJob();
      if (active?.jobId) {
        navigation.replace('MealPlanProgress', { jobId: active.jobId, requestId: active.requestId });
      }
    };
    resume();
  }, [navigation]);

  return (
    <>
      <Appbar.Header>
        <Appbar.Content title="Meal Planning" />
      </Appbar.Header>
      <View style={styles.container}>
        <Text variant="bodyLarge" style={styles.lead}>
          Plan your meals for the week. We’ll suggest recipes for the meals you select.
        </Text>
        <Button mode="contained" onPress={() => navigation.navigate('MealPlanDateRange')}>
          Plan your meals
        </Button>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  lead: {
    marginBottom: 8,
  },
});

export default MealPlanListScreen;

