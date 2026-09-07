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
