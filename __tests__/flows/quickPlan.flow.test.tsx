/**
 * FLOW: the default planner, over the wire.
 *
 * __tests__/screens/QuickPlanScreen.test.tsx already covers this screen's
 * behaviour with the service mocked. What it cannot see is the request that
 * leaves the app: `slots` shaped wrong, or an id that stringifies to null, looks
 * identical from inside the screen and 422s in production. So this file asserts
 * bodies, and the hop into the advanced planner.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import PlannerNavigator from '../../src/navigation/PlannerNavigator';
import { lastCallTo, randomSlot, renderInApp, resetApi, route, upcomingDates } from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

beforeEach(() => {
  resetApi();
  route('GET', '/tags', []);
});

const plan = async () => {
  fireEvent.press(await screen.findByText(/^Plan \d+ meals$/));
};

test('planning asks for exactly the days and meals selected', async () => {
  const week = upcomingDates(7);
  route('POST', '/meal-plans/random', {
    slots: [randomSlot({ date: week[0] })],
    incomplete: false,
  });

  renderInApp(<PlannerNavigator />);
  await plan();

  await waitFor(() => expect(lastCallTo('POST', '/meal-plans/random')).toBeDefined());
  // Dinner for the next seven days is the default, so the common case is one tap.
  expect(lastCallTo('POST', '/meal-plans/random')!.data).toEqual({
    slots: week.map((date) => ({ date, meal_type: 'dinner' })),
    exclude_recipe_ids: [],
  });
});

test('deselecting days and adding a meal changes what is requested', async () => {
  const week = upcomingDates(7);
  route('POST', '/meal-plans/random', { slots: [], incomplete: false });

  renderInApp(<PlannerNavigator />);
  // Turn off every day but the first two, and add breakfast.
  await screen.findByText('Days');
  const dayLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()}`;
  };
  week.slice(2).forEach((date) => fireEvent.press(screen.getByText(dayLabel(date))));
  fireEvent.press(screen.getByText('Breakfast'));
  await plan();

  await waitFor(() => expect(lastCallTo('POST', '/meal-plans/random')).toBeDefined());
  expect(lastCallTo('POST', '/meal-plans/random')!.data.slots).toEqual([
    { date: week[0], meal_type: 'breakfast' },
    { date: week[0], meal_type: 'dinner' },
    { date: week[1], meal_type: 'breakfast' },
    { date: week[1], meal_type: 'dinner' },
  ]);
});

test('re-rolling one meal sends every id currently on screen', async () => {
  const week = upcomingDates(7);
  route('POST', '/meal-plans/random', {
    slots: [
      randomSlot({ date: week[0], recipe_id: 4, title: 'Swap This' }),
      randomSlot({ date: week[1], recipe_id: 9, title: 'Keep This' }),
    ],
    incomplete: false,
  });
  route('POST', '/meal-plans/random/reroll', {
    meal_type: 'dinner',
    recipe_id: 11,
    title: 'Fresh Pick',
  });

  renderInApp(<PlannerNavigator />);
  await plan();
  await waitFor(() => expect(screen.getByText('Swap This')).toBeTruthy());

  fireEvent.press(screen.getByLabelText(`Re-roll dinner on ${week[0]}`));

  await waitFor(() => expect(screen.getByText('Fresh Pick')).toBeTruthy());
  expect(lastCallTo('POST', '/meal-plans/random/reroll')!.data).toEqual({
    meal_type: 'dinner',
    exclude_recipe_ids: [4, 9],
    tags: [],
  });
  // The other day is untouched.
  expect(screen.getByText('Keep This')).toBeTruthy();
});

test('a re-roll all excludes the whole current plan, so it genuinely changes', async () => {
  const week = upcomingDates(7);
  route('POST', '/meal-plans/random', ({ data }) =>
    // Second call is the re-roll; answer with different recipes so the screen
    // has something new to show.
    data.exclude_recipe_ids.length
      ? { slots: [randomSlot({ date: week[0], recipe_id: 7, title: 'Second Try' })], incomplete: false }
      : { slots: [randomSlot({ date: week[0], recipe_id: 4, title: 'First Try' })], incomplete: false },
  );

  renderInApp(<PlannerNavigator />);
  await plan();
  await waitFor(() => expect(screen.getByText('First Try')).toBeTruthy());

  fireEvent.press(screen.getByText('Re-roll all'));

  await waitFor(() => expect(screen.getByText('Second Try')).toBeTruthy());
  expect(lastCallTo('POST', '/meal-plans/random')!.data.exclude_recipe_ids).toEqual([4]);
});

test('an empty slot contributes no id, rather than a null the server rejects', async () => {
  // exclude_recipe_ids is List[int] server-side. A slot the picker could not fill
  // has no recipe_id, and sending null for it 422s the entire re-roll.
  const week = upcomingDates(7);
  route('POST', '/meal-plans/random', {
    slots: [randomSlot({ date: week[0], recipe_id: 4 }), { date: week[1], meal_type: 'dinner' }],
    incomplete: true,
  });
  route('POST', '/meal-plans/random/reroll', { meal_type: 'dinner', recipe_id: 11, title: 'Fresh' });

  renderInApp(<PlannerNavigator />);
  await plan();
  await waitFor(() => expect(screen.getByText('No recipe yet')).toBeTruthy());

  fireEvent.press(screen.getByLabelText(`Re-roll dinner on ${week[1]}`));

  await waitFor(() => expect(lastCallTo('POST', '/meal-plans/random/reroll')).toBeDefined());
  expect(lastCallTo('POST', '/meal-plans/random/reroll')!.data.exclude_recipe_ids).toEqual([4]);
});

test('a server refusal is shown rather than swallowed', async () => {
  route('POST', '/meal-plans/random', () => {
    const err: any = new Error('boom');
    err.response = { status: 400, data: { detail: 'No recipes in your box yet.' } };
    return err;
  });

  renderInApp(<PlannerNavigator />);
  await plan();

  await waitFor(() => expect(screen.getByText('No recipes in your box yet.')).toBeTruthy());
});

test('the advanced planner is one tap away and starts at date selection', async () => {
  renderInApp(<PlannerNavigator />);

  fireEvent.press(await screen.findByLabelText('Advanced planning'));

  await waitFor(() => expect(screen.getByText('Select dates')).toBeTruthy());
});
