/**
 * FLOW: reading back a plan that was saved.
 *
 * Committing used to be write-only — the plan landed in the database and no
 * screen anywhere read it. These cover the three places it now surfaces: the
 * planner tab's answer to "what are we eating", the library of everything saved,
 * and one plan opened from it.
 */
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import PlannerNavigator from '../../src/navigation/PlannerNavigator';
import { callsTo, httpError, renderInApp, resetApi, route } from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

// Anchored: an unanchored '/planner/plans' also matches '/planner/plans/2', and
// routes are matched most-recent-first, so the collection would answer a request
// for a single plan with an array.
const PLANS_LIST = /^\/planner\/plans$/;

const meal = (date: string, mealType: string, id: number, title: string, minutes = 30) => ({
  id,
  date,
  meal_type: mealType,
  recipe_id: id,
  title,
  total_time_minutes: minutes,
});

const PLAN = {
  id: 2,
  user_id: '1',
  name: null,
  start_date: '2026-09-06',
  items: [
    meal('2026-09-06', 'dinner', 26, 'Thai Basil Chicken'),
    meal('2026-09-06', 'lunch', 35, 'Chicken Caesar Salad'),
    meal('2026-09-07', 'dinner', 1, 'Meatloaf Recipe'),
  ],
};

const SUMMARY = {
  id: 2,
  name: null,
  start_date: '2026-09-06',
  end_date: '2026-09-07',
  meal_count: 3,
  created_at: '2026-09-05T23:33:38',
};

beforeEach(() => {
  resetApi();
  jest.restoreAllMocks();
  route('GET', '/tags', []);
});

const autoConfirm = (label: string) =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    (buttons ?? []).find((b) => b.text === label)?.onPress?.();
  });

// ── the planner tab ───────────────────────────────────────────────────────────

test('the saved plan is the first thing on the planner', async () => {
  route('GET', '/planner/current', PLAN);

  renderInApp(<PlannerNavigator />);

  await waitFor(() => expect(screen.getByText('Thai Basil Chicken')).toBeTruthy());
  expect(screen.getByText('Meatloaf Recipe')).toBeTruthy();
  // The picker is still there, below it.
  expect(screen.getByText(/^Plan \d+ meals$/)).toBeTruthy();
});

test('a day lists its meals in time-of-day order, not commit order', async () => {
  // The server returns items in whatever order they were committed, which is the
  // order the picker was tapped. Lunch belongs above dinner regardless.
  route('GET', '/planner/current', PLAN);

  renderInApp(<PlannerNavigator />);
  await waitFor(() => expect(screen.getByText('Chicken Caesar Salad')).toBeTruthy());

  const labels = screen
    .getAllByLabelText(/^(Lunch|Dinner): /)
    .map((el) => el.props.accessibilityLabel);
  expect(labels).toEqual([
    'Lunch: Chicken Caesar Salad',
    'Dinner: Thai Basil Chicken',
    'Dinner: Meatloaf Recipe',
  ]);
});

test('no saved plan leaves the picker alone rather than showing an error', async () => {
  // The server answers {} for "nothing planned yet", which is the normal state
  // for a new household.
  route('GET', '/planner/current', {});

  renderInApp(<PlannerNavigator />);

  await waitFor(() => expect(screen.getByText(/^Plan \d+ meals$/)).toBeTruthy());
  expect(screen.queryByText('Open')).toBeNull();
});

test('a failed lookup does not take the planner down with it', async () => {
  // Someone opening this tab came to plan. A failed lookup of the saved plan is
  // not worth an error banner over the thing that still works.
  route('GET', '/planner/current', httpError(500));

  renderInApp(<PlannerNavigator />);

  await waitFor(() => expect(screen.getByText(/^Plan \d+ meals$/)).toBeTruthy());
});

// ── the library ───────────────────────────────────────────────────────────────

test('the saved plans list shows a span and a count', async () => {
  route('GET', '/planner/current', {});
  route('GET', PLANS_LIST, [SUMMARY]);

  renderInApp(<PlannerNavigator />);
  fireEvent.press(await screen.findByLabelText('Saved plans'));

  await waitFor(() => expect(screen.getByText('Saved plans')).toBeTruthy());
  expect(screen.getByLabelText(/Meal plan, Sunday 6 – Monday 7/)).toBeTruthy();
  expect(screen.getByText('3 meals')).toBeTruthy();
});

test('an empty library explains how to fill it', async () => {
  route('GET', '/planner/current', {});
  route('GET', PLANS_LIST, []);

  renderInApp(<PlannerNavigator />);
  fireEvent.press(await screen.findByLabelText('Saved plans'));

  await waitFor(() => expect(screen.getByText('No saved plans yet.')).toBeTruthy());
});

test('opening a plan from the library shows its meals', async () => {
  route('GET', '/planner/current', {});
  route('GET', PLANS_LIST, [SUMMARY]);
  route('GET', '/planner/plans/2', PLAN);

  renderInApp(<PlannerNavigator />);
  fireEvent.press(await screen.findByLabelText('Saved plans'));
  fireEvent.press(await screen.findByLabelText(/Meal plan, Sunday 6/));

  await waitFor(() => expect(screen.getByText('Thai Basil Chicken')).toBeTruthy());
  expect(screen.getByText('Chicken Caesar Salad')).toBeTruthy();
  expect(screen.getByText('Meatloaf Recipe')).toBeTruthy();
});

test('deleting a plan removes it and returns to the library', async () => {
  route('GET', '/planner/current', {});
  route('GET', '/planner/plans/2', PLAN);
  let deleted = false;
  route('GET', PLANS_LIST, () => (deleted ? [] : [SUMMARY]));
  route('DELETE', '/planner/plans/2', () => {
    deleted = true;
    return undefined;
  });

  renderInApp(<PlannerNavigator />);
  fireEvent.press(await screen.findByLabelText('Saved plans'));
  fireEvent.press(await screen.findByLabelText(/Meal plan, Sunday 6/));
  await screen.findByText('Thai Basil Chicken');

  autoConfirm('Delete');
  fireEvent.press(screen.getByLabelText('Delete this plan'));

  await waitFor(() => expect(callsTo('DELETE', '/planner/plans/2')).toHaveLength(1));
  await waitFor(() => expect(screen.getByText('No saved plans yet.')).toBeTruthy());
});

test('a refused delete keeps the plan on screen', async () => {
  route('GET', '/planner/current', {});
  route('GET', PLANS_LIST, [SUMMARY]);
  route('GET', '/planner/plans/2', PLAN);
  route('DELETE', '/planner/plans/2', httpError(500, 'Could not delete that plan.'));

  renderInApp(<PlannerNavigator />);
  fireEvent.press(await screen.findByLabelText('Saved plans'));
  fireEvent.press(await screen.findByLabelText(/Meal plan, Sunday 6/));
  await screen.findByText('Thai Basil Chicken');

  autoConfirm('Delete');
  fireEvent.press(screen.getByLabelText('Delete this plan'));

  await waitFor(() => expect(screen.getByText('Could not delete that plan.')).toBeTruthy());
  expect(screen.getByText('Thai Basil Chicken')).toBeTruthy();
});

/**
 * Rearranging a saved plan.
 *
 * Before PATCH /planner/plans/{id}/items the only way to change a committed
 * plan was to delete it and start again, so moving one meal meant losing the
 * rest. Asserted over the wire: the body is what the server acts on, and a
 * move that patches local state without leaving the app looks identical here.
 */
const openPlan = async () => {
  route('GET', '/planner/current', {});
  route('GET', PLANS_LIST, [SUMMARY]);
  route('GET', '/planner/plans/2', PLAN);

  renderInApp(<PlannerNavigator />);
  fireEvent.press(await screen.findByLabelText('Saved plans'));
  fireEvent.press(await screen.findByLabelText(/Meal plan, Sunday 6/));
  await waitFor(() => expect(screen.getByText('Meatloaf Recipe')).toBeTruthy());
};

test('moving a meal earlier patches the plan', async () => {
  await openPlan();
  route('PATCH', '/planner/plans/2/items', {
    ...PLAN,
    items: [
      meal('2026-09-06', 'dinner', 26, 'Thai Basil Chicken'),
      meal('2026-09-06', 'lunch', 35, 'Chicken Caesar Salad'),
      meal('2026-09-06', 'supper', 1, 'Meatloaf Recipe'),
    ],
  });

  fireEvent.press(screen.getByLabelText('Move dinner on 2026-09-07 earlier'));

  await waitFor(() => expect(callsTo('PATCH', '/planner/plans/2/items')).toHaveLength(1));
  expect(callsTo('PATCH', '/planner/plans/2/items')[0].data).toEqual({
    moves: [{ item_id: 1, date: '2026-09-06', meal_type: 'dinner' }],
  });
});

test('the target day is the plan\'s previous day, not yesterday', async () => {
  // A plan covering Mon/Wed/Fri must move Wednesday's meal to Monday, not to a
  // Tuesday the plan never included.
  route('GET', '/planner/current', {});
  route('GET', PLANS_LIST, [SUMMARY]);
  route('GET', '/planner/plans/2', {
    ...PLAN,
    items: [
      meal('2026-09-06', 'dinner', 26, 'Thai Basil Chicken'),
      meal('2026-09-09', 'dinner', 1, 'Meatloaf Recipe'),
    ],
  });
  route('PATCH', '/planner/plans/2/items', PLAN);

  renderInApp(<PlannerNavigator />);
  fireEvent.press(await screen.findByLabelText('Saved plans'));
  fireEvent.press(await screen.findByLabelText(/Meal plan, Sunday 6/));
  await waitFor(() => expect(screen.getByText('Meatloaf Recipe')).toBeTruthy());

  fireEvent.press(screen.getByLabelText('Move dinner on 2026-09-09 earlier'));

  await waitFor(() => expect(callsTo('PATCH', '/planner/plans/2/items')).toHaveLength(1));
  expect(callsTo('PATCH', '/planner/plans/2/items')[0].data.moves[0].date).toBe('2026-09-06');
});

test('the screen takes the server\'s version of the plan, including a swap', async () => {
  // The server may have swapped with whatever occupied the target slot. Patching
  // one item locally would show a plan the server does not have.
  await openPlan();
  route('PATCH', '/planner/plans/2/items', {
    ...PLAN,
    items: [
      meal('2026-09-07', 'dinner', 26, 'Thai Basil Chicken'),
      meal('2026-09-06', 'lunch', 35, 'Chicken Caesar Salad'),
      meal('2026-09-06', 'dinner', 1, 'Meatloaf Recipe'),
    ],
  });

  fireEvent.press(screen.getByLabelText('Move dinner on 2026-09-07 earlier'));

  await waitFor(() =>
    expect(screen.getByLabelText('Move dinner on 2026-09-06 later')).toBeTruthy(),
  );
  // Meatloaf moved to the 6th and Thai Basil was displaced to the 7th.
  expect(screen.getByLabelText('Move dinner on 2026-09-07 earlier')).toBeTruthy();
});

test('the first day cannot move earlier and the last cannot move later', async () => {
  await openPlan();

  expect(screen.getByLabelText('Move dinner on 2026-09-06 earlier').props.accessibilityState)
    .toMatchObject({ disabled: true });
  expect(screen.getByLabelText('Move dinner on 2026-09-07 later').props.accessibilityState)
    .toMatchObject({ disabled: true });
});

test('a failed move keeps the plan on screen', async () => {
  await openPlan();
  route('PATCH', '/planner/plans/2/items', httpError(409, 'Two meals cannot be moved to the same day and meal type'));

  fireEvent.press(screen.getByLabelText('Move dinner on 2026-09-07 earlier'));

  await waitFor(() =>
    expect(screen.getByText(/Two meals cannot be moved/)).toBeTruthy(),
  );
  // Losing the plan on a failed move would be worse than the failure.
  expect(screen.getByText('Meatloaf Recipe')).toBeTruthy();
});

// ── drilling into a planned meal ──────────────────────────────────────────────
//
// This covers the drill-in WORKING: the recipe renders and Back returns to the
// plan. It does NOT prove the tab-jump fix, and an earlier version of this
// comment wrongly claimed it did -- reinstating
// getParent().navigate('RecipesTab', ...) leaves it green, because once
// RecipeDetail is mounted in this stack both versions render it, and bottom tabs
// keep their screens mounted so "which tab is in front" is invisible to queries.
// __tests__/navigation/PlannerDrillIn.test.ts pins that part.

test('a planned meal opens over the plan, and Back returns to it', async () => {
  route('GET', '/planner/current', PLAN);
  route('GET', /^\/recipes\/26$/, {
    id: 26,
    title: 'Thai Basil Chicken',
    ingredients: [{ id: 1, text: 'chicken', quantity_display: '1 lb', unit: 'lb' }],
    steps: [{ id: 1, step_number: 1, text: 'Fry it.' }],
    tags: [],
  });

  renderInApp(<PlannerNavigator />);
  await waitFor(() => expect(screen.getByText('Thai Basil Chicken')).toBeTruthy());

  fireEvent.press(screen.getByText('Thai Basil Chicken'));

  // The recipe itself: its step text is on screen, which the plan never shows.
  await waitFor(() => expect(screen.getByText('Fry it.')).toBeTruthy());

  fireEvent.press(screen.getByLabelText('Back'));

  // Back to the PLAN -- the other two meals are visible again.
  await waitFor(() => expect(screen.getByText('Meatloaf Recipe')).toBeTruthy());
  expect(screen.queryByText('Fry it.')).toBeNull();
});
