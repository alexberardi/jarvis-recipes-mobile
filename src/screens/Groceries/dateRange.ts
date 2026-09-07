/**
 * Shopping ranges.
 *
 * All local-date arithmetic: `toISOString()` converts to UTC first, which east
 * of UTC lands on the previous day and would shop for the wrong week.
 */
export type RangePreset = 'this-week' | 'next-week' | 'next-7';

export const toIso = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addDays = (d: Date, days: number) => {
  const next = new Date(d);
  next.setDate(d.getDate() + days);
  return next;
};

/**
 * Sunday of the week containing `from`.
 *
 * Sunday-start because that is how the planner's calendar is laid out; a
 * shopping week that disagreed with the planning week would split a plan across
 * two lists.
 */
const startOfWeek = (from: Date) => addDays(from, -from.getDay());

export const rangeFor = (preset: RangePreset, today = new Date()): { start: string; end: string } => {
  switch (preset) {
    case 'this-week': {
      const start = startOfWeek(today);
      return { start: toIso(start), end: toIso(addDays(start, 6)) };
    }
    case 'next-week': {
      const start = addDays(startOfWeek(today), 7);
      return { start: toIso(start), end: toIso(addDays(start, 6)) };
    }
    case 'next-7':
    default:
      // From today, not from Sunday: someone shopping on Thursday for the days
      // ahead does not want Sunday through Wednesday on the list.
      return { start: toIso(today), end: toIso(addDays(today, 6)) };
  }
};

export const PRESET_LABELS: Record<RangePreset, string> = {
  'this-week': 'This week',
  'next-week': 'Next week',
  'next-7': 'Next 7 days',
};
