/**
 * The default planning screen.
 *
 * The behaviours worth pinning are the ones a shuffle makes easy to get subtly
 * wrong: re-rolling one slot must not disturb the others, and every re-roll must
 * exclude what is already on screen or it hands back the recipe just rejected.
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import QuickPlanScreen from '../../src/screens/Planner/QuickPlanScreen';
import { randomPlan, rerollSlot } from '../../src/services/mealPlans';

jest.mock('../../src/services/mealPlans', () => ({
  randomPlan: jest.fn(),
  rerollSlot: jest.fn(),
}));

// The screen looks up the saved plan on focus. None here: this file is about the
// picker, and the saved-plan block has its own tests in the flow suite.
jest.mock('../../src/services/plans', () => ({
  ...jest.requireActual('../../src/services/plans'),
  getCurrentPlan: jest.fn().mockResolvedValue(null),
}));

const mockRandomPlan = randomPlan as jest.MockedFunction<typeof randomPlan>;
const mockReroll = rerollSlot as jest.MockedFunction<typeof rerollSlot>;

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

// NavigationContainer, not a bare render: the screen uses useFocusEffect, which
// needs a real navigation context even though `navigation` itself is stubbed.
const renderScreen = () =>
  render(
    <PaperProvider>
      <NavigationContainer>
        <QuickPlanScreen navigation={navigation} route={{ key: 'k', name: 'QuickPlan' } as any} />
      </NavigationContainer>
    </PaperProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
});

const slot = (date: string, id: number, title: string) => ({
  date,
  meal_type: 'dinner',
  recipe_id: id,
  title,
  total_time_minutes: 30,
});

test('defaults to a week of dinners so a plan is one tap away', () => {
  renderScreen();

  // 7 days x dinner
  expect(screen.getByText('Plan 7 meals')).toBeTruthy();
});

test('builds a plan and lists every meal', async () => {
  mockRandomPlan.mockResolvedValue({
    slots: [slot('2026-09-07', 1, 'Beef Stroganoff'), slot('2026-09-08', 2, 'Tacos')],
    incomplete: false,
  });
  renderScreen();

  fireEvent.press(screen.getByText('Plan 7 meals'));

  await waitFor(() => expect(screen.getByText('Beef Stroganoff')).toBeTruthy());
  expect(screen.getByText('Tacos')).toBeTruthy();
});

test('re-rolling one meal leaves the others alone', async () => {
  mockRandomPlan.mockResolvedValue({
    slots: [slot('2026-09-07', 1, 'Keep Me'), slot('2026-09-08', 2, 'Swap Me')],
    incomplete: false,
  });
  mockReroll.mockResolvedValue({ meal_type: 'dinner', recipe_id: 9, title: 'Brand New' });
  renderScreen();

  fireEvent.press(screen.getByText('Plan 7 meals'));
  await waitFor(() => expect(screen.getByText('Swap Me')).toBeTruthy());

  fireEvent.press(screen.getByLabelText('Re-roll dinner on 2026-09-08'));

  await waitFor(() => expect(screen.getByText('Brand New')).toBeTruthy());
  expect(screen.getByText('Keep Me')).toBeTruthy();
  expect(screen.queryByText('Swap Me')).toBeNull();
});

test('a re-roll excludes everything already on screen', async () => {
  mockRandomPlan.mockResolvedValue({
    slots: [slot('2026-09-07', 1, 'One'), slot('2026-09-08', 2, 'Two')],
    incomplete: false,
  });
  mockReroll.mockResolvedValue({ meal_type: 'dinner', recipe_id: 3, title: 'Three' });
  renderScreen();

  fireEvent.press(screen.getByText('Plan 7 meals'));
  await waitFor(() => expect(screen.getByText('One')).toBeTruthy());

  fireEvent.press(screen.getByLabelText('Re-roll dinner on 2026-09-07'));

  await waitFor(() => expect(mockReroll).toHaveBeenCalled());
  // Without this the server can hand back the very recipe just rejected.
  expect(mockReroll).toHaveBeenCalledWith('dinner', [1, 2]);
});

test('an exhausted box explains itself rather than failing silently', async () => {
  mockRandomPlan.mockResolvedValue({ slots: [slot('2026-09-07', 1, 'Only')], incomplete: false });
  mockReroll.mockRejectedValue({ response: { status: 409 } });
  renderScreen();

  fireEvent.press(screen.getByText('Plan 7 meals'));
  await waitFor(() => expect(screen.getByText('Only')).toBeTruthy());

  fireEvent.press(screen.getByLabelText('Re-roll dinner on 2026-09-07'));

  await waitFor(() =>
    expect(screen.getByText(/No other recipe to swap in/)).toBeTruthy(),
  );
});

test('a box too small to fill the week says so', async () => {
  mockRandomPlan.mockResolvedValue({
    slots: [slot('2026-09-07', 1, 'One'), { date: '2026-09-08', meal_type: 'dinner' }],
    incomplete: true,
  });
  renderScreen();

  fireEvent.press(screen.getByText('Plan 7 meals'));

  await waitFor(() =>
    expect(screen.getByText(/Not enough recipes to fill every meal/)).toBeTruthy(),
  );
});

test('the advanced planner is still reachable', () => {
  renderScreen();

  fireEvent.press(screen.getByLabelText('Advanced planning'));

  expect(navigation.navigate).toHaveBeenCalledWith('MealPlanDateRange');
});

// ── Date handling ─────────────────────────────────────────────────────────────

test('an ISO date renders as the same calendar day, not the one before', () => {
  // new Date("2026-09-07") parses as UTC midnight, so anywhere behind UTC it
  // formats as 2026-09-06. That is how "Sunday - 9/6/2026" appeared above a
  // validation message naming 2026-09-07.
  const iso = '2026-09-07';

  const naive = new Date(iso);
  const local = new Date(`${iso}T00:00:00`);

  expect(local.getDate()).toBe(7);
  expect(local.getMonth()).toBe(8); // September
  // Guard the assumption this test exists for. The two only disagree BEHIND UTC,
  // where UTC midnight is still the previous evening; east of UTC (the suite's
  // pinned zone) they agree, and asserting a difference there proves nothing.
  // getTimezoneOffset is positive west of UTC.
  if (new Date().getTimezoneOffset() > 0) {
    expect(naive.getDate()).not.toBe(local.getDate());
  }
});
