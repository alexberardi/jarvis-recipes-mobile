import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Appbar, Button, HelperText, IconButton, Text } from 'react-native-paper';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PlannerStackParamList, 'MealPlanDateRange'>;

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

const buildMonthDays = (month: Date) => {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
};

const todayKey = fmt(new Date());

const MealPlanDateRangeScreen = ({ navigation }: Props) => {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => buildMonthDays(month), [month]);
  const monthKey = month.toISOString().slice(0, 7);
  const firstDayOffset = days.length ? days[0].getDay() : 0;

  const toggle = (date: string) => {
    if (date < todayKey) return; // do not allow past dates
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const handleContinue = () => {
    setError(null);
    if (!selected.size) {
      setError('Select at least one day.');
      return;
    }
    const dates = Array.from(selected).sort();
    navigation.navigate('MealPlanDayConfig', { dates });
  };

  const monthLabel = month.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Select dates" />
      </Appbar.Header>
      <View style={styles.container}>
        <View style={styles.monthHeader}>
          <IconButton
            icon="chevron-left"
            onPress={() => setMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1)))}
          />
          <Text variant="titleMedium">{monthLabel}</Text>
          <IconButton
            icon="chevron-right"
            onPress={() => setMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1)))}
          />
        </View>
        <View style={styles.weekdays}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, idx) => (
            <Text key={`${d}-${idx}`} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {Array.from({ length: firstDayOffset }).map((_, idx) => (
            <View key={`pad-${monthKey}-${idx}`} style={styles.cell} />
          ))}
          {days.map((d, idx) => {
            const key = fmt(d);
            const isSelected = selected.has(key);
            const isPast = key < todayKey;
            return (
              <Pressable
                key={`day-${monthKey}-${idx}-${key}`}
                style={[
                  styles.cell,
                  isSelected && styles.cellSelected,
                  isPast && styles.cellDisabled,
                ]}
                onPress={() => toggle(key)}
                disabled={isPast}
              >
                <Text
                  style={
                    isSelected
                      ? styles.cellTextSelected
                      : isPast
                        ? styles.cellTextDisabled
                        : styles.cellText
                  }
                >
                  {d.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {error ? (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        ) : null}
        <Button mode="contained" onPress={handleContinue}>
          Continue
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
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  weekday: {
    width: 36,
    textAlign: 'center',
    opacity: 0.7,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  cell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cellSelected: {
    backgroundColor: '#8A00C4',
  },
  cellDisabled: {
    opacity: 0.3,
  },
  cellText: {
    color: 'rgba(255,255,255,0.9)',
  },
  cellTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  cellTextDisabled: {
    color: 'rgba(255,255,255,0.4)',
  },
});

export default MealPlanDateRangeScreen;

