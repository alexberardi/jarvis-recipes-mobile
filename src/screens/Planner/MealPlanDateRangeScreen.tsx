import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Appbar, Button, HelperText, IconButton, Text, useTheme } from 'react-native-paper';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<PlannerStackParamList, 'MealPlanDateRange'>;

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

/**
 * Local calendar date as YYYY-MM-DD.
 *
 * NOT toISOString().slice(0,10): the grid is built from local-midnight Dates, and
 * toISOString converts to UTC first. East of UTC that lands on the previous day,
 * so every cell carried a key one day earlier than the number printed on it --
 * and the dates handed to the next screen were off by one. West of UTC the cells
 * were fine but `todayKey` was not: after ~20:00 local it read as tomorrow, which
 * greyed out today.
 */
const fmt = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const buildMonthDays = (month: Date) => {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
};

const MealPlanDateRangeScreen = ({ navigation }: Props) => {
  const theme = useTheme();
  // Computed per render rather than at module load: the module is evaluated once
  // per app launch, so a session left open across midnight kept yesterday's key.
  const todayKey = fmt(new Date());
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
                  // Colours come from the theme, never from literals. These were
                  // white-on-translucent-white, written for a dark theme, so in
                  // light mode the whole month rendered invisible -- every date
                  // present and tappable, none of them legible.
                  {
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : theme.colors.surfaceVariant,
                  },
                  isPast && styles.cellDisabled,
                ]}
                onPress={() => toggle(key)}
                disabled={isPast}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isPast }}
                accessibilityLabel={key}
              >
                <Text
                  style={[
                    styles.cellText,
                    isSelected && styles.cellTextSelected,
                    {
                      color: isSelected
                        ? theme.colors.onPrimary
                        : isPast
                          ? theme.colors.onSurfaceDisabled
                          : theme.colors.onSurfaceVariant,
                    },
                  ]}
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
  },
  cellDisabled: {
    opacity: 0.4,
  },
  cellText: {
    fontVariant: ['tabular-nums'],
  },
  cellTextSelected: {
    fontWeight: '600',
  },
});

export default MealPlanDateRangeScreen;

