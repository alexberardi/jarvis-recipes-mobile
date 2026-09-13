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
import {
  httpError,
  lastCallTo,
  randomSlot,
  renderInApp,
  resetApi,
  route,
  upcomingDates,
} from './harness';

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

/**
 * The quick planner had no save at all.
 *
 * `slots` lived in component state, so generating a week felt like it worked
 * and nothing was stored -- the plan was gone as soon as the tab changed. The
 * advanced flow has had "Save this plan" all along, which is why only the
 * simple path was affected.
 *
 * Asserted over the wire rather than through the screen: the failure mode is a
 * commit that never leaves, or leaves with the wrong body.
 */
test('saving the generated week commits it', async () => {
  const week = upcomingDates(7);
  route('GET', '/planner/current', {});
  route('POST', '/meal-plans/random', {
    slots: [
      randomSlot({ date: week[0], recipe_id: 4, title: 'Tacos' }),
      randomSlot({ date: week[1], recipe_id: 9, title: 'Steak and Fries' }),
    ],
    incomplete: false,
  });
  route('POST', '/planner/commit', { id: 31, start_date: week[0] });

  renderInApp(<PlannerNavigator />);
  await plan();

  fireEvent.press(await screen.findByText('Save this plan'));

  await waitFor(() => expect(lastCallTo('POST', '/planner/commit')).toBeDefined());
  expect(lastCallTo('POST', '/planner/commit')!.data).toEqual({
    start_date: week[0],
    name: undefined,
    items: [
      { date: week[0], meal_type: 'dinner', recipe_id: 4, source: 'user' },
      { date: week[1], meal_type: 'dinner', recipe_id: 9, source: 'user' },
    ],
  });
});

test('the start date is the earliest day, not the first slot returned', async () => {
  // The server may return slots in any order; committing the wrong start_date
  // files the plan under the wrong week.
  const week = upcomingDates(7);
  route('GET', '/planner/current', {});
  route('POST', '/meal-plans/random', {
    slots: [
      randomSlot({ date: week[3], recipe_id: 4 }),
      randomSlot({ date: week[1], recipe_id: 9 }),
    ],
    incomplete: false,
  });
  route('POST', '/planner/commit', { id: 32, start_date: week[1] });

  renderInApp(<PlannerNavigator />);
  await plan();
  fireEvent.press(await screen.findByText('Save this plan'));

  await waitFor(() => expect(lastCallTo('POST', '/planner/commit')).toBeDefined());
  expect(lastCallTo('POST', '/planner/commit')!.data.start_date).toBe(week[1]);
});

test('empty slots are skipped rather than sent as null ids', async () => {
  // The picker can ask for more meals than there are recipes, so a slot with no
  // recipe is a real outcome -- and a null recipe_id 422s the commit endpoint.
  const week = upcomingDates(7);
  route('GET', '/planner/current', {});
  route('POST', '/meal-plans/random', {
    slots: [
      randomSlot({ date: week[0], recipe_id: 4 }),
      randomSlot({ date: week[1], recipe_id: null, title: null }),
    ],
    incomplete: true,
  });
  route('POST', '/planner/commit', { id: 33, start_date: week[0] });

  renderInApp(<PlannerNavigator />);
  await plan();
  fireEvent.press(await screen.findByText('Save this plan'));

  await waitFor(() => expect(lastCallTo('POST', '/planner/commit')).toBeDefined());
  expect(lastCallTo('POST', '/planner/commit')!.data.items).toEqual([
    { date: week[0], meal_type: 'dinner', recipe_id: 4, source: 'user' },
  ]);
});

test('a plan with nothing in it is not sent at all', async () => {
  const week = upcomingDates(7);
  route('GET', '/planner/current', {});
  route('POST', '/meal-plans/random', {
    slots: [randomSlot({ date: week[0], recipe_id: null, title: null })],
    incomplete: true,
  });

  renderInApp(<PlannerNavigator />);
  await plan();
  fireEvent.press(await screen.findByText('Save this plan'));

  await waitFor(() =>
    expect(screen.getByText(/every meal is still empty/i)).toBeTruthy(),
  );
  expect(lastCallTo('POST', '/planner/commit')).toBeUndefined();
});

test('a failed save keeps the plan on screen to retry', async () => {
  const week = upcomingDates(7);
  route('GET', '/planner/current', {});
  route('POST', '/meal-plans/random', {
    slots: [randomSlot({ date: week[0], recipe_id: 4, title: 'Tacos' })],
    incomplete: false,
  });
  route('POST', '/planner/commit', httpError(500, 'Could not save the plan.'));

  renderInApp(<PlannerNavigator />);
  await plan();
  fireEvent.press(await screen.findByText('Save this plan'));

  await waitFor(() => expect(screen.getByText('Could not save the plan.')).toBeTruthy());
  // The week must still be there -- losing the picks on a failed save is worse
  // than the failure.
  expect(screen.getByText('Tacos')).toBeTruthy();
  expect(screen.getByText('Save this plan')).toBeTruthy();
});
